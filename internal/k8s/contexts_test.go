package k8s

import (
	"os"
	"path/filepath"
	"testing"

	"k8s.io/client-go/kubernetes"
)

func writeTestKubeconfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}
	return path
}

func TestListContextsSortsAndMarksCurrent(t *testing.T) {
	kubeconfigPath := writeTestKubeconfig(t, `apiVersion: v1
kind: Config
clusters:
- name: alpha
  cluster:
    server: https://127.0.0.1:6443
    insecure-skip-tls-verify: true
- name: beta
  cluster:
    server: https://127.0.0.2:6443
    insecure-skip-tls-verify: true
contexts:
- name: zulu
  context:
    cluster: beta
    namespace: z-ns
- name: alpha
  context:
    cluster: alpha
    namespace: a-ns
current-context: zulu
`)

	got, err := ListContexts(kubeconfigPath)
	if err != nil {
		t.Fatalf("list contexts: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d contexts, want 2", len(got))
	}
	if got[0].Name != "alpha" || got[1].Name != "zulu" {
		t.Fatalf("sort order: %#v", got)
	}
	if !got[1].Current || got[0].Current {
		t.Fatalf("current flag: %#v", got)
	}
	if got[0].Cluster != "alpha" || got[0].Namespace != "a-ns" {
		t.Fatalf("alpha fields: %#v", got[0])
	}
	if got[1].Cluster != "beta" || got[1].Namespace != "z-ns" {
		t.Fatalf("zulu fields: %#v", got[1])
	}
}

func TestClientForContextSupportsOIDCAuthProvider(t *testing.T) {
	kubeconfig := `apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://127.0.0.1:6443
    insecure-skip-tls-verify: true
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user
current-context: test-context
users:
- name: test-user
  user:
    auth-provider:
      name: oidc
      config:
        client-id: test-client
        client-secret: test-secret
        id-token: test-token
        idp-issuer-url: https://issuer.example.test
        refresh-token: test-refresh
`

	kubeconfigPath := writeTestKubeconfig(t, kubeconfig)

	clientConfig, err := ClientForContext(kubeconfigPath, "")
	if err != nil {
		t.Fatalf("load client config: %v", err)
	}

	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		t.Fatalf("build rest config: %v", err)
	}

	if _, err := kubernetes.NewForConfig(restConfig); err != nil {
		t.Fatalf("build kubernetes client: %v", err)
	}
}

func TestWithCurrentContextMarksResolvedContext(t *testing.T) {
	contexts := []ContextInfo{
		{Name: "staging", Current: true},
		{Name: "forno"},
	}

	got := WithCurrentContext(contexts, "forno")

	if got[0].Current {
		t.Fatalf("staging should not remain current")
	}
	if !got[1].Current {
		t.Fatalf("forno should be current")
	}
	if contexts[0].Current != true || contexts[1].Current != false {
		t.Fatalf("input contexts should not be mutated")
	}
}
