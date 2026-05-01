package cli

// These are populated at build time via -ldflags.
//   go build -ldflags "-X github.com/gabriel-dantas98/kubeaquarium/internal/cli.Version=v0.1.0 ..."
var (
	Version = "dev"
	Commit  = "none"
	Date    = "unknown"
)
