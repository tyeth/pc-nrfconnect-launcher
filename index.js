/* Copyright (c) 2015 - 2017, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Use in source and binary forms, redistribution in binary form only, with
 * or without modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions in binary form, except as embedded into a Nordic
 *    Semiconductor ASA integrated circuit in a product or a software update for
 *    such product, must reproduce the above copyright notice, this list of
 *    conditions and the following disclaimer in the documentation and/or other
 *    materials provided with the distribution.
 *
 * 2. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * 3. This software, with or without modification, must only be used with a Nordic
 *    Semiconductor ASA integrated circuit.
 *
 * 4. Any software provided in binary form under this license must not be reverse
 *    engineered, decompiled, modified and/or disassembled.
 *
 * THIS SOFTWARE IS PROVIDED BY NORDIC SEMICONDUCTOR ASA "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY, NONINFRINGEMENT, AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

const { existsSync } = require('fs');
const { resolve, basename } = require('path');

const { execPath } = process;

// When nRFConnect is running production environment where modules are in asar
// package, nRFjprog libraries are bundled outside of asar.
// In order to correctly set the library search path of pc-nrfjprog-js module
// here we need to set the environment variable before the module is loaded.
if (basename(execPath, '.exe') !== 'electron') {
    const nRFjprogSearchPath = [
        resolve(execPath, '../nrfjprog'),
        resolve(execPath, '../../Frameworks/nrfjprog'),
        resolve(process.cwd(), 'nrfjprog'),
    ].filter(path => existsSync(path)).shift();

    if (nRFjprogSearchPath) {
        process.env.NRFJPROG_LIBRARY_PATH = nRFjprogSearchPath;
    }
}

const {
    Menu, ipcMain, dialog, app: electronApp, BrowserWindow,
} = require('electron');
const { argv } = require('yargs');
const {
    default: installExtension, REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS,
} = require('electron-devtools-installer');

const config = require('./main/config');
const windows = require('./main/windows');
const apps = require('./main/apps');
const { createMenu } = require('./main/menu');

// Ensure that nRFConnect runs in a directory where it has permission to write
process.chdir(electronApp.getPath('temp'));

config.init(argv);
global.homeDir = config.getHomeDir();
global.userDataDir = config.getUserDataDir();
global.appsRootDir = config.getAppsRootDir();

const applicationMenu = Menu.buildFromTemplate(createMenu(electronApp));

electronApp.on('ready', () => {
    if (process.argv.includes('--install-dev-tools')) {
        installExtension([REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS])
            .then(names => console.log(`Added Extensions:  ${names}`))
            .catch(err => console.log(`An error occurred: ${err}`));
    }
    if (process.argv.includes('--remove-dev-tools')) {
        const devToolsExtensions = Object.keys(BrowserWindow.getDevToolsExtensions());
        devToolsExtensions.forEach(BrowserWindow.removeDevToolsExtension);
    }

    Menu.setApplicationMenu(applicationMenu);
    apps.initAppsDirectory()
        .then(() => {
            if (config.getOfficialAppName()) {
                return windows.openOfficialAppWindow(
                    config.getOfficialAppName(), config.getSourceName(),
                );
            }
            if (config.getLocalAppName()) {
                return windows.openLocalAppWindow(config.getLocalAppName());
            }
            return windows.openLauncherWindow();
        })
        .catch(error => {
            dialog.showMessageBox({
                type: 'error',
                title: 'Initialization error',
                message: 'Error when starting application',
                detail: error.message,
                buttons: ['OK'],
            }, () => electronApp.quit());
        });
});

electronApp.on('window-all-closed', () => {
    electronApp.quit();
});

ipcMain.on('open-app-launcher', () => {
    windows.openLauncherWindow();
});

ipcMain.on('open-app', (event, app) => {
    windows.openAppWindow(app);
});

ipcMain.on('show-about-dialog', () => {
    const appWindow = windows.getFocusedAppWindow();
    if (appWindow) {
        const { app } = appWindow;
        const detail = `${app.description}\n\n`
            + `Version: ${app.currentVersion}\n`
            + `Official: ${app.isOfficial}\n`
            + `Supported engines: nRF Connect ${app.engineVersion}\n`
            + `Current engine: nRF Connect ${config.getVersion()}\n`
            + `App directory: ${app.path}`;
        dialog.showMessageBox(appWindow.browserWindow, {
            type: 'info',
            title: 'About',
            message: `${app.displayName || app.name}`,
            detail,
            icon: app.iconPath ? app.iconPath : `${__dirname}/resources/nrfconnect.png`,
            buttons: ['OK'],
        }, () => {});
    }
});

ipcMain.on('get-app-details', event => {
    const appWindow = windows.getFocusedAppWindow();
    if (appWindow) {
        const details = Object.assign({
            coreVersion: config.getVersion(),
            corePath: config.getElectronRootPath(),
            homeDir: config.getHomeDir(),
            tmpDir: config.getTmpDir(),
        }, appWindow.app);
        event.sender.send('app-details', details);
    }
});
