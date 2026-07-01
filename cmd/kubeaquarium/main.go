package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gabriel-dantas98/kubeaquarium/internal/cli"
	"github.com/gabriel-dantas98/kubeaquarium/internal/k8s"
	"github.com/gabriel-dantas98/kubeaquarium/internal/server"
	"github.com/gabriel-dantas98/kubeaquarium/internal/webassets"
	"k8s.io/client-go/kubernetes"
)

const usage = `kubeaquarium — a live 3D aquarium for your Kubernetes cluster

USAGE:
  kubeaquarium [flags]                start the server (default)
  kubeaquarium contexts               list kubeconfig contexts
  kubeaquarium version                print version info
  kubeaquarium help                   print this message

FLAGS:
  --addr           listen address                      (default 127.0.0.1:7777)
  --context        kubeconfig context to use           (default current-context)
  --kubeconfig     path to kubeconfig                  (default $KUBECONFIG or ~/.kube/config)
  --no-open        do not auto-open the browser
  --no-banner      suppress the start-up banner

EXAMPLES:
  kubeaquarium
  kubeaquarium --context my-eks-prod
  kubeaquarium --addr 0.0.0.0:8080 --no-open
`

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version", "-v", "--version":
			fmt.Printf("kubeaquarium %s (commit %s, built %s)\n", cli.Version, cli.Commit, cli.Date)
			return
		case "help", "-h", "--help":
			fmt.Print(usage)
			return
		case "contexts":
			runContexts(os.Args[2:])
			return
		}
	}
	runServer(os.Args[1:])
}

func runContexts(args []string) {
	fs := flag.NewFlagSet("contexts", flag.ExitOnError)
	kubeconfig := fs.String("kubeconfig", os.Getenv("KUBECONFIG"), "path to kubeconfig")
	fs.Parse(args)
	contexts, err := k8s.ListContexts(*kubeconfig)
	if err != nil {
		cli.Errorf("could not read kubeconfig: %v", err)
		os.Exit(1)
	}
	if len(contexts) == 0 {
		cli.Errorf("no contexts found in kubeconfig")
		cli.Hint("set KUBECONFIG or run `kubectl config get-contexts` to verify")
		os.Exit(1)
	}
	for _, c := range contexts {
		marker := "  "
		if c.Current {
			marker = "* "
		}
		ns := c.Namespace
		if ns == "" {
			ns = "(default)"
		}
		fmt.Printf("%s%-30s  cluster=%s  ns=%s\n", marker, c.Name, c.Cluster, ns)
	}
}

func runServer(args []string) {
	fs := flag.NewFlagSet("server", flag.ContinueOnError)
	fs.Usage = func() { fmt.Print(usage) }
	addr := fs.String("addr", "127.0.0.1:7777", "listen address")
	kubeconfig := fs.String("kubeconfig", os.Getenv("KUBECONFIG"), "path to kubeconfig")
	contextName := fs.String("context", "", "kubeconfig context (default current-context)")
	noOpen := fs.Bool("no-open", false, "do not auto-open the browser")
	noBanner := fs.Bool("no-banner", false, "suppress the start-up banner")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return
		}
		os.Exit(2)
	}

	rootCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() { <-sigCh; cancel() }()

	contexts, err := k8s.ListContexts(*kubeconfig)
	if err != nil {
		cli.Errorf("reading kubeconfig: %v", err)
		cli.Hint("ensure KUBECONFIG is set or ~/.kube/config exists")
		os.Exit(1)
	}
	if len(contexts) == 0 {
		cli.Errorf("no contexts found in kubeconfig")
		cli.Hint("run `kubectl config get-contexts` to verify your kubeconfig")
		os.Exit(1)
	}

	resolvedContext := *contextName
	if resolvedContext == "" {
		for _, c := range contexts {
			if c.Current {
				resolvedContext = c.Name
				break
			}
		}
	}
	if resolvedContext != "" {
		found := false
		for _, c := range contexts {
			if c.Name == resolvedContext {
				found = true
				break
			}
		}
		if !found {
			cli.Errorf("context %q not found", resolvedContext)
			cli.Hint("run `kubeaquarium contexts` to see available contexts")
			os.Exit(1)
		}
	}
	contexts = k8s.WithCurrentContext(contexts, resolvedContext)

	cc, err := k8s.ClientForContext(*kubeconfig, *contextName)
	if err != nil {
		cli.Errorf("loading client config: %v", err)
		os.Exit(1)
	}
	rest, err := cc.ClientConfig()
	if err != nil {
		cli.Errorf("kubeconfig has issues: %v", err)
		cli.Hint("verify that your context's auth (e.g. exec plugin, certificate) is valid")
		os.Exit(1)
	}
	cs, err := kubernetes.NewForConfig(rest)
	if err != nil {
		cli.Errorf("could not create kubernetes client: %v", err)
		os.Exit(1)
	}

	// Probe connectivity before promising the user anything.
	probeDone := make(chan error, 1)
	go func() { _, e := cs.Discovery().ServerVersion(); probeDone <- e }()
	select {
	case e := <-probeDone:
		if e != nil {
			cli.Errorf("could not reach the cluster: %v", e)
			cli.Hint("does `kubectl --context %s get nodes` work?", resolvedContext)
			os.Exit(1)
		}
	case <-time.After(6 * time.Second):
		cli.Errorf("timed out reaching the cluster")
		cli.Hint("verify the API server endpoint is reachable for context %q", resolvedContext)
		os.Exit(1)
	}

	// Reserve a port; fall back to 77xx if 7777 is busy.
	listenAddr, err := cli.FindFreeAddr(*addr)
	if err != nil {
		cli.Errorf("%v", err)
		os.Exit(1)
	}
	if listenAddr != *addr {
		cli.Hint("port %s busy → using %s instead", *addr, listenAddr)
	}

	w := k8s.NewWatcher(cs)
	if err := w.Start(rootCtx); err != nil {
		cli.Errorf("starting watcher: %v", err)
		os.Exit(1)
	}
	defer w.Stop()

	staticFS, err := webassets.FS()
	if err != nil {
		cli.Errorf("loading embedded frontend: %v", err)
		os.Exit(1)
	}

	url := "http://" + listenAddr
	if !*noBanner {
		cli.PrintBanner(os.Stdout, url, resolvedContext)
	}
	if !*noOpen {
		_ = cli.OpenBrowser(url)
	}

	s := server.New(listenAddr, staticFS, w, cs, contexts)
	if err := s.Run(rootCtx); err != nil && !errors.Is(err, http.ErrServerClosed) && !strings.Contains(err.Error(), "Server closed") {
		cli.Errorf("server: %v", err)
		os.Exit(1)
	}
}
