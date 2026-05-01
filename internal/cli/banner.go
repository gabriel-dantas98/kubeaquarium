package cli

import (
	"fmt"
	"io"
	"os"
)

// ANSI helpers — no-op when stdout isn't a terminal so logs stay clean in pipes.
type style struct{ on bool }

func newStyle(w io.Writer) style {
	if f, ok := w.(*os.File); ok {
		fi, err := f.Stat()
		if err == nil && (fi.Mode()&os.ModeCharDevice) != 0 {
			return style{on: true}
		}
	}
	return style{}
}

func (s style) wrap(code, text string) string {
	if !s.on {
		return text
	}
	return "\033[" + code + "m" + text + "\033[0m"
}

func (s style) Bold(t string) string  { return s.wrap("1", t) }
func (s style) Dim(t string) string   { return s.wrap("2", t) }
func (s style) Cyan(t string) string  { return s.wrap("36", t) }
func (s style) Blue(t string) string  { return s.wrap("34", t) }
func (s style) Green(t string) string { return s.wrap("32", t) }
func (s style) Red(t string) string   { return s.wrap("31", t) }
func (s style) Yel(t string) string   { return s.wrap("33", t) }

// PrintBanner writes the colourful start-up banner to w.
func PrintBanner(w io.Writer, url, contextName string) {
	s := newStyle(w)
	logo := []string{
		`     _         _                                       _`,
		`    | | ___   _| |__   ___  __ _  __ _ _   _  __ _ _ __(_)_   _ _ __ ___`,
		`    | |/ / | | | '_ \ / _ \/ _` + "`" + ` |/ _` + "`" + ` | | | |/ _` + "`" + ` | '__| | | | | '_ ` + "`" + ` _ \`,
		`    |   <| |_| | |_) |  __/ (_| | (_| | |_| | (_| | |  | | |_| | | | | | |`,
		`    |_|\_\\__,_|_.__/ \___|\__,_|\__, |\__,_|\__,_|_|  |_|\__,_|_| |_| |_|`,
		`                                  |___/`,
	}
	fmt.Fprintln(w)
	for _, line := range logo {
		fmt.Fprintln(w, s.Cyan(line))
	}
	fmt.Fprintln(w, s.Dim("    a 3D aquarium for your Kubernetes cluster"))
	fmt.Fprintln(w)
	fmt.Fprintf(w, "    %s  %s\n", s.Dim("context:"), s.Bold(contextName))
	fmt.Fprintf(w, "    %s  %s\n", s.Dim("ready  :"), s.Green(url))
	fmt.Fprintln(w)
	fmt.Fprintf(w, "    %s\n", s.Dim("press Ctrl+C to stop"))
	fmt.Fprintln(w)
}

// Errorf prints a friendly red error and returns a non-nil error suitable for `os.Exit`.
func Errorf(format string, a ...any) {
	s := newStyle(os.Stderr)
	fmt.Fprintf(os.Stderr, "%s %s\n", s.Red("error:"), fmt.Sprintf(format, a...))
}

func Hint(format string, a ...any) {
	s := newStyle(os.Stderr)
	fmt.Fprintf(os.Stderr, "%s %s\n", s.Yel("hint :"), fmt.Sprintf(format, a...))
}
