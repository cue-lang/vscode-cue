// Copyright 2021 The CUE Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package codereviewcfg

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// Config returns the code review config rooted at root.  Configs consist of
// lines of the form "key: value". Lines beginning with # are comments. If
// there is no config or the config is malformed, an error is returned.
func Config(root string) (map[string]string, error) {
	configPath := filepath.Join(root, "codereview.cfg")
	b, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load config from %v: %v", configPath, err)
	}
	cfg := make(map[string]string)
	for _, line := range nonBlankLines(string(b)) {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#") {
			// comment line
			continue
		}
		fields := strings.SplitN(line, ":", 2)
		if len(fields) != 2 {
			return nil, fmt.Errorf("bad config line in %v; expected 'key: value': %q", configPath, line)
		}
		cfg[strings.TrimSpace(fields[0])] = strings.TrimSpace(fields[1])
	}
	return cfg, nil
}

// lines returns the lines in text.
func lines(text string) []string {
	out := strings.Split(text, "\n")
	// Split will include a "" after the last line. Remove it.
	if n := len(out) - 1; n >= 0 && out[n] == "" {
		out = out[:n]
	}
	return out
}

// nonBlankLines returns the non-blank lines in text.
func nonBlankLines(text string) []string {
	var out []string
	for _, s := range lines(text) {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func GerritURLToServer(urlString string) (string, error) {
	u, err := url.Parse(urlString)
	if err != nil {
		return "", fmt.Errorf("failed to parse URL from %q: %v", urlString, err)
	}
	u.Path = ""
	return u.String(), nil
}

func GithubURLToParts(urlString string) (string, string, error) {
	u, err := url.Parse(urlString)
	if err != nil {
		return "", "", fmt.Errorf("failed to parse URL from %q: %v", urlString, err)
	}

	pathSplit := strings.Split(u.Path, "/")
	if len(pathSplit) != 3 {
		return "", "", fmt.Errorf("unexpected URL format %q", urlString)
	}
	return pathSplit[1], pathSplit[2], nil
}
