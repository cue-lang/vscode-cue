# VSCode Extension for the CUE Language

## What it's for

CUE - Configure, Unify, Execute - is a language designed for designing,
generating, and validating data. Read more about it on [the official site, cuelang.org](https://cuelang.org).

## Why this extension is useful

[Visual Studio Code](https://code.visualstudio.com/) is an awesome, extensible, multi-platform editor and IDE.
Its ecosystem has a massive number of plugins for different languages, and this one implements syntax highlighting
(and potentially more functionality in the future) for the CUE language.

## How you can use it

Unfortunately, the `.cue` extension which CUE uses is squatted on in the "official" VSCode registry by the file format used to describe audio CD tracklistings.
So for the moment, manual installation is required. This is quite simple though. Once you have VSCode installed, simply clone this repo into its extension location:

```shell
git clone https://github.com/cue-sh/vscode-cue ~/.vscode/extensions/vscode-cue
```

Restart VSCode and you should have syntax highlighting for any `.cue` files you load.

## Credits

This project was started by [betawaffle](https://github.com/betawaffle) who graciously permitted that it be moved
to a more general home in the [cue-sh](https://github.com/cue-sh) organisation.
