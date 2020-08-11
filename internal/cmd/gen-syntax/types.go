package main

import "log"

type Rule struct {
	Include       string   `json:"include,omitempty"`
	Match         string   `json:"match,omitempty"`
	Captures      Captures `json:"captures,omitempty"`
	Begin         string   `json:"begin,omitempty"`
	BeginCaptures Captures `json:"beginCaptures,omitempty"`
	End           string   `json:"end,omitempty"`
	EndCaptures   Captures `json:"endCaptures,omitempty"`
	ContentName   string   `json:"contentName,omitempty"`
	Patterns      Rules    `json:"patterns,omitempty"`
	Name          string   `json:"name,omitempty"`
}

func (r Rule) EachInclude(f func(string) bool) {
	if include := r.Include; len(include) > 0 {
		if include[0] != '#' {
			return
		}
		name := include[1:]
		if !f(name) {
			return
		}
		ir, ok := repository[name]
		if !ok {
			log.Fatalf("rule %q not found in repository", name)
		}
		ir.EachInclude(f)
		return
	}
	r.BeginCaptures.EachInclude(f)
	r.EndCaptures.EachInclude(f)
	r.Captures.EachInclude(f)
	r.Patterns.EachInclude(f)
}

func (r Rule) Simplify(seen map[string]int) Rule {
	if include := r.Include; len(include) > 0 {
		if include[0] == '#' {
			name := include[1:]
			if seen[name] == 1 {
				r = repository[name].Simplify(seen)
				delete(repository, name)
			}
		}
		return r
	}
	r.BeginCaptures.Simplify(seen)
	r.EndCaptures.Simplify(seen)
	r.Captures.Simplify(seen)
	r.Patterns.Simplify(seen)
	return r
}

type Rules []Rule

func (rs Rules) EachInclude(f func(string) bool) {
	for _, r := range rs {
		r.EachInclude(f)
	}
}

func (rs Rules) Simplify(seen map[string]int) {
	for i, r := range rs {
		rs[i] = r.Simplify(seen)
	}
}

type RuleMap map[string]Rule

func (rm RuleMap) Simplify(seen map[string]int) {
	for k, r := range rm {
		rm[k] = r.Simplify(seen)
	}
	for name := range rm {
		switch seen[name] {
		case 0:
			log.Printf("repository rule %q is unused", name)
			delete(repository, name)
		case 1:
			log.Printf("repository rule %q is only used once", name)
		default:
		}
	}
}

type Capture struct {
	Patterns Rules  `json:"patterns,omitempty"`
	Name     string `json:"name,omitempty"`
}

type Captures map[int]Capture

func (cs Captures) EachInclude(f func(string) bool) {
	for _, c := range cs {
		c.Patterns.EachInclude(f)
	}
}

func (cs Captures) Simplify(seen map[string]int) {
	for _, c := range cs {
		c.Patterns.Simplify(seen)
	}
}

type WalkFunc func(string, *Rule)
