package main

import (
	"os"

	"otterscale/client/internal/cli"
)

func main() {
	os.Exit(cli.Run(os.Args[1:], os.Stdout, os.Stderr, cli.Live{}))
}
