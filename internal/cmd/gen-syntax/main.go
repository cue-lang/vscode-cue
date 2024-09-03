package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"os"
)

func main() {
	log.SetFlags(0)
	validate()
	var wb bytes.Buffer
	if err := encode(&wb); err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile(os.Args[1], wb.Bytes(), 0644); err != nil {
		log.Fatal(err)
	}
}

func encode(dst io.Writer) error {
	enc := json.NewEncoder(dst)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "\t")
	return enc.Encode(&root)
}

func validate() {
	seen := make(map[string]int)
	patterns.EachInclude(func(name string) bool {
		n, ok := seen[name]
		seen[name] = n + 1
		return !ok
	})
	patterns.Simplify(seen)
	repository.Simplify(seen)
}
