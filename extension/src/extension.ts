// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { LanguageClient, ServerOptions } from 'vscode-languageclient/node';
import { LanguageClientOptions } from 'vscode-languageclient';
import { workspace, ExtensionContext } from 'vscode';

let client: LanguageClient;

const supportedPlatforms = {
  'linux-x64': { goos: 'linux', goarch: 'amd64' },
  'linux-arm64': { goos: 'linux', goarch: 'arm64' },
  'darwin-x64': { goos: 'darwin', goarch: 'amd64' },
  'darwin-arm64': { goos: 'darwin', goarch: 'arm64' },
  'win32-x64': { goos: 'windows', goarch: 'amd64' },
  'win32-arm64': { goos: 'windows', goarch: 'arm64' }
} as {
  [key: string]: {
    goos: string;
    goarch: string;
  };
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "vscode-cue" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand('vscode-cue.welcome', () => {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    vscode.window.showInformationMessage('Welcome to CUE');
  });

  context.subscriptions.push(disposable);

  const fs = require('fs');
  const { mkdir } = require('fs/promises');
  const { Readable } = require('stream');
  const { finished } = require('stream/promises');
  const path = require('path');
  const downloadFile = async (url, fileName) => {
    const res = await fetch(url);
    if (!fs.existsSync('downloads')) await mkdir('downloads'); //Optional if you already have downloads directory
    const destination = path.resolve('./downloads', fileName);
    const fileStream = fs.createWriteStream(destination, { flags: 'wx' });
    await finished(Readable.fromWeb(res.body).pipe(fileStream));
  };
  await downloadFile('<url_to_fetch>', '<fileName>');

  console.log(supportedPlatforms);
  console.log(process.env.PATH);
  console.log(context);

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    command: '/home/myitcv/bingo/bin/cuepls'
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: 'file', language: 'cue' }]
  };

  // Create the language client and start the client.
  client = new LanguageClient('languageServerExample', 'Language Server Example', serverOptions, clientOptions);

  // Start the client. This will also launch the server
  client.start();
}

// This method is called when your extension is deactivated
export function deactivate() {}
