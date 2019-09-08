
syntaxes/cue.tmLanguage.json: bin/gen-syntax
	$< $@

bin:
	mkdir -p bin

bin/gen-syntax: $(wildcard cmd/gen-syntax/*.go) bin
	go build -o $@ ./cmd/gen-syntax
