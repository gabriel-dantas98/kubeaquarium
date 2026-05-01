package cli

import (
	"fmt"
	"net"
	"strconv"
	"strings"
)

// FindFreeAddr returns the first free address starting at preferred. It tries
// the preferred port first, then preferred+1..preferred+9. Useful so users
// can run multiple kubeaquarium instances and the second one doesn't crash.
func FindFreeAddr(preferred string) (string, error) {
	host, portStr, err := net.SplitHostPort(preferred)
	if err != nil {
		return "", fmt.Errorf("invalid --addr %q: %w", preferred, err)
	}
	if !strings.Contains(host, ":") && host == "" {
		host = "127.0.0.1"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return "", fmt.Errorf("invalid port in --addr %q: %w", preferred, err)
	}

	for p := port; p < port+10; p++ {
		addr := net.JoinHostPort(host, strconv.Itoa(p))
		l, err := net.Listen("tcp", addr)
		if err == nil {
			l.Close()
			return addr, nil
		}
	}
	return "", fmt.Errorf("no free port found in %d..%d", port, port+9)
}
