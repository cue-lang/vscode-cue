'use strict';

import * as tar from 'tar';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import crypto = require('crypto');
import * as stream from 'node:stream';

import { LanguageClient, ServerOptions } from 'vscode-languageclient/node';
import { LanguageClientOptions } from 'vscode-languageclient';

// Note by myitcv
// ==============
// I am not good with TypeScript. I struggle with writing idiomatic code. Truth
// be told I would prefer to have written this extension in Go and use GopherJS
// to transpile to JavaScript. But that's for another day. Any poor style, etc,
// is my own.
//
// Structure
// =========
// This will probably come back to bite us down the line, but we use global
// state for the extension to make writing code cleaner. It might seem like a
// small thing, but having 99% of code indented within a class or namespace
// becomes a tiring waste of space, coming from Go. This does have the notable
// side effect that we don't have a sensible value for 'this', but given that
// global state is always available, this doesn't feel like a big loss.
//
// In a similar vein, everything will start in a single .ts file to avoid the
// mess of importing from multiple files in the same directory (I can't seem to
// find an analog for Go's packages).

// TODO: top-level list
//
// * Return errors instead of string values in Promise<Err> situations below.

// ctx is the global that represents the context of the active extension.
//
// A value of undefined indicates the extension is not active on the current
// system (for example, the current system might not be a supported platform or
// architecture).
var ctx: vscode.ExtensionContext;

// targetPlatform is the supported platform for the current system. This
// variable may only be defined if ctx !== undefined.
var targetPlatform: supportedPlatform;

// client is running LSP client. This variable may only be defined if ctx !==
// undefined. If ctx !== undefined, then a value of undefined for client
// indicates that no LSP client is running.
var client: LanguageClient;

export async function activate(context: vscode.ExtensionContext): Promise<undefined> {
  // Early check that we support this GOOS-GOARCH pair
  let goos = knownGooses[os.platform()];
  let goarch = knownGoarchs[os.arch()];
  targetPlatform = targets[`${goos}-${goarch}`];
  if (targetPlatform === undefined) {
    vscode.window.showErrorMessage(`Platform-Arch ${os.platform()}-${os.arch()} is not supported`);
    return Promise.resolve(undefined);
  }

  console.log('vscode-cue activated');

  // Only set ctx now that we know this is a supported platform.
  ctx = context;

  registerCommand('vscode-cue.welcome', cmdWelcomeCUE);
  registerCommand('vscode-cue.installlsp', cmdInstallLSP);
  registerCommand('vscode-cue.startlsp', cmdStartLSP);
  registerCommand('vscode-cue.stoplsp', cmdStopLSP);

  // run cuepls async from the main activate thread
  runCUEpls();
}

export async function deactivate(): Promise<undefined> {
  if (ctx === undefined) {
    // Nothing to do
    return Promise.resolve(undefined);
  }

  console.log('vscode-cue deactivated');

  return Promise.resolve(undefined);
}

function registerCommand(cmd: string, callback: (...args: any[]) => any) {
  var disposable = vscode.commands.registerCommand(cmd, callback);
  ctx.subscriptions.push(disposable);
}

function cmdWelcomeCUE() {
  vscode.window.showInformationMessage('Welcome to CUE');
}

// runCUEpls is responsible for starting cuepls.
//
// TODO: proper error handling strategy here. This is run async from activate
// so updating the user is "up to us".
async function runCUEpls(): Promise<Err> {
  let err;

  // TODO: add logic for checking (with fallthrough on empty post-trimming
  // string values)
  //
  // * env var for cuepls command
  // * config option for cuepls command
  // * cueplsPath()
  //
  // Each case should do info/warning/error notification. The last step should,
  // as the final step, error in case we don't have a valid cuepls path. This
  // could happen, for example, in case cuepls is not available at that path
  // and the user chooses not to install cuepls. In this case we should show an
  // error message to the user explaining the impact of their decision not to
  // install cuepls.

  // TODO: this checking of the checksum is racey. Anything more we can do
  // here? Copy to a temp directory (which would be hard/impossible to guess)
  // and run from their?

  // Check if there is a file at that path, and if so that it matches the
  // checksums we know for the version we are expecting.
  let found = false;
  let fileContents;
  [fileContents, err] = await ve(fs.promises.stat(cueplsPath()));
  found = !isErrnoException(err);

  if (!found) {
    // First ensure that the directory path exists
    let targetDir = path.dirname(cueplsPath());
    [, err] = await ve(fs.promises.mkdir(targetDir, { recursive: true }));
    if (err !== null) {
      return Promise.reject(`failed to mkdir ${targetDir}: ${err}`);
    }
    let answer = await vscode.window.showInformationMessage(
      `cuepls is not installed in ${cueplsPath()}; install?`,
      'Yes',
      'No'
    );
    if (answer === 'Yes') {
      let err = await installCUEpls(cueplsPath());
      if (err !== null) {
        return Promise.reject(`failed to install cuepls: ${err}`);
      }
      console.log('we successfully installed cuepls');
      // Fall through to run cuepls after sha256 sum check
    } else {
      vscode.window.showErrorMessage('cuepls not installed; CUE language server will not be available');
      return Promise.resolve(null);
    }
  }

  // Unless we experience a race we know cuepls is installed at cueplsPath.
  // Check the sha256 sum agrees.
  let buffer;
  [buffer, err] = await ve(fs.promises.readFile(cueplsPath()));
  if (err !== null) {
    return Promise.reject(`failed to read ${cueplsPath()} for sum check: ${err}`);
  }
  let sum = crypto.createHash('sha256').update(buffer!).digest('hex');
  if (sum !== targetPlatform.sha256) {
    vscode.window.showErrorMessage('Installed cuepls has mistmatched sha256 sum');
    return Promise.resolve(null);
  }

  // If the extension is launched in debug mode then the debug server options
  // are used Otherwise the run options are used
  const serverOptions: ServerOptions = {
    command: '/home/myitcv/bingo/bin/cuepls'
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: 'file', language: 'cue' }]
  };

  // Create the language client and start the client.
  //
  // TODO: handle the client/server dying and informing the user.
  client = new LanguageClient('languageServerExample', 'Language Server Example', serverOptions, clientOptions);
  client.start();
  ctx.subscriptions.push(client);

  return Promise.resolve(null);
}

// cueplsPath returns the absolute path to the default location of cuepls. That
// is the path from which cuepls will be run in the case we don't have any
// environment variable or config to tell us otherwise.
function cueplsPath(): string {
  return path.join(ctx.extensionPath, binDir, cuePls);
}

async function installCUEpls(targetPath: string): Promise<Err> {
  let err;
  let extension = '.tar.gz';
  let decompress = untarCUEpls;
  if (goos() === 'windows') {
    extension = '.zip';
    decompress = unzipCUEpls;
  }

  // Build the path of the file to download
  let downloadURL = `https://github.com/cue-lang/cue/releases/download/${CUEVersion}/cue_${CUEVersion}_${goos()}_${goarch()}${extension}`;
  console.log(`downloading CUE from ${downloadURL}`);
  let resp;
  [resp, err] = await ve(fetch(downloadURL, { redirect: 'follow' }));
  if (err !== null) {
    return Promise.reject(new Error(`failed to fetch: ${err}`));
  }

  let targetFile = fs.createWriteStream(targetPath, {
    flags: 'wx',
    mode: 0o777
  });

  err = await decompress(stream.Readable.fromWeb(resp!.body!), targetFile);
  if (err !== null) {
    return Promise.reject(err);
  }

  return Promise.resolve(null);
}

const binDir = '.bin';

async function untarCUEpls(source: stream.Readable, dst: fs.WriteStream): Promise<Err> {
  let err, tempDir;
  [tempDir, err] = await ve(fs.promises.mkdtemp(path.join(os.tmpdir(), 'cuepls-download-')));
  if (err !== null) {
    return Promise.reject(`failed to create temp download dir: ${err}`);
  }
  let downloadPath = path.join(tempDir!, 'download');
  console.log(`temp dir is ${tempDir}`);

  let res = new Defer();
  res.defer(() => {
    fs.promises.rm(tempDir!, { recursive: true, force: true });
  });

  // TODO: not sure I fully follow the API of tar. Specifically, I can't see
  // how the stream based approach would ever work with the sync option. As
  // such, wrap in a promise and await. sync option here
  let p = new Promise<void>((resolve, reject) => {
    let x = tar.x({
      C: tempDir!
    });
    x.on('error', (e) => {
      reject(e);
    });
    x.on('end', () => {
      resolve();
    });

    // TODO: possible to only extract the file we need?
    source.pipe(x);
  });

  // TODO: why do we not get type errors on await expressions? The reason I ask
  // this question is that previously we had a line as follows:
  //
  //     await x
  //
  // and TypeScript gave no error. 'x' is not a promise, or thennable or
  // anything. So at runtime, it didn't await as expected, it just blew
  // straight past the statement. 30 mins lost.
  await p;

  // Copy cuepls into place.
  let src = fs.createReadStream(path.join(tempDir!, cuePls));

  [, err] = await ve(stream.promises.pipeline(src, dst));
  if (err !== null) {
    return res.reject(new Error(`failed to write to destination: ${err}`));
  }

  await null;

  return res.resolve(null);
}

async function unzipCUEpls(source: stream.Readable, dst: fs.WriteStream): Promise<Err> {
  // // Load the buffer into AdmZip
  // const zip = new AdmZip(buffer);
  // // Extract the specified file
  // const zipEntry = zip.getEntry(fileName);
  // if (!zipEntry) {
  //   return Promise.reject(new Error(`File ${fileName} not found in the ZIP archive`));
  // }
  //
  // Read the response as an ArrayBuffer
  // const buffer = await response.arrayBuffer();
  // // Load the buffer into AdmZip
  // const zip = new AdmZip(Buffer.from(buffer));
  // // Extract the specified file
  // const zipEntry = zip.getEntry(fileName);
  // if (!zipEntry) {
  //   return Promise.reject(new Error(`File ${fileName} not found in the ZIP archive`));
  // }
  //
  return Promise.resolve(null);
}

// cuePls is the name of the binary
const cuePls = 'cuepls';

// This feels rather extraordinary
//
// https://stackoverflow.com/questions/51523509/in-typescript-how-do-you-make-a-distinction-between-node-and-vanilla-javascript
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    isArbitraryObject(error) &&
    error instanceof Error &&
    (typeof error.errno === 'number' || typeof error.errno === 'undefined') &&
    (typeof error.code === 'string' || typeof error.code === 'undefined') &&
    (typeof error.path === 'string' || typeof error.path === 'undefined') &&
    (typeof error.syscall === 'string' || typeof error.syscall === 'undefined')
  );
}

type ArbitraryObject = { [key: string]: unknown };

function isArbitraryObject(potentialObject: unknown): potentialObject is ArbitraryObject {
  return typeof potentialObject === 'object' && potentialObject !== null;
}

// Err is a convenience type for a nullable error, much like error in Go
type Err = Error | null;

// ValErr is convenience type for a nullable [value, error] pair. JavaScript
// does not have zero values and hence we are forced to create a nullable
// type.
type ValErr<T> = [T | null, Error | null];

// ve converts a promise that returns a single value to a promise that returns
// a [value, error] tuple, the error being the value "caught" in case the input
// promise is rejected. When used with 'await', this allows JavaScript-native
// Promise-aware functions that otherwise encourage the use of try-catch with
// 'await' to transform results into a more Go-style of error handling.
//
// TODO: can we be smarter with the Promise<void> case?
function ve<T>(p: Promise<T>): Promise<ValErr<T>> {
  return p.then(
    (v: T) => {
      return [v, null];
    },
    (err) => {
      return [null, err];
    }
  );
}

// https://nodejs.org/api/os.html#osplatform
let knownGooses: { [key: string]: string } = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows'
};

// https://nodejs.org/api/os.html#osarch
let knownGoarchs: { [key: string]: string } = {
  x64: 'amd64',
  arm64: 'arm64'
};

// targets defines a map of the target supported platforms (in terms of GOOS
// and GOARCH) for cuepls.
//
// TODO: move this to a code-generated step.
type supportedPlatform = {
  sha256: string;
};
let targets: { [key: string]: supportedPlatform } = {
  // 'darwin-amd64': {},
  // 'darwin-arm64': {},
  // 'linux-amd64': {},
  'linux-arm64': {
    sha256: 'f25679a10c61c508901be9960520f8ba68f175da1c66db0ff91e3658329cdff6'
  }
  // 'windows-amd64': {},
  // 'windows-arm64': {}
};

// CUEVersion is the version of CUE (and cuepls) that we are pinned against.
//
// TODO: move this to a code-generated step
const CUEVersion = 'v0.11.0-alpha.1';

// goos returns the GOOS value for the current system. In the case that ctx
// is not undefined, i.e. the extension successfully activated, it is guaranteed
// to return a valid GOOS value.
function goos(): string {
  return knownGooses[os.platform()];
}

// goarch returns the GOARCH value for the current system. In the case that ctx
// is not undefined, i.e. the extension successfully activated, it is guaranteed
// to return a valid GOARCH value.
function goarch(): string {
  return knownGoarchs[os.arch()];
}

// Defer is a class that tries to help emulate the behaviour of Go's defer.
class Defer {
  private defers = new Array<() => void>();

  defer(f: () => void) {
    this.defers.push(f);
  }

  private pop(): Promise<boolean> {
    let p = Promise.resolve(true);
    for (let i = this.defers.length - 1; i >= 0; i--) {
      p = p.finally(this.defers[i]);
    }
    return p.catch(() => Promise.resolve(true));
  }

  reject<T>(v: T): Promise<T> {
    return this.pop().then(() => Promise.reject(v));
  }

  resolve<T>(v: T): Promise<T> {
    return this.pop().then(() => v);
  }
}
