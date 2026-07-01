package k8s

import (
	"os"
	"path/filepath"
	"testing"

	"k8s.io/client-go/kubernetes"
)

func TestClientForContextSupportsOIDCAuthProvider(t *testing.T) {
	kubeconfigPath := filepath.Join(t.TempDir(), "config")
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

	if err := os.WriteFile(kubeconfigPath, []byte(kubeconfig), 0o600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}

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
