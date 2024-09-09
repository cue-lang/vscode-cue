// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { LanguageClient, ServerOptions } from 'vscode-languageclient/node';
import { LanguageClientOptions } from 'vscode-languageclient';
import { workspace, ExtensionContext } from 'vscode';

let client: LanguageClient;

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
