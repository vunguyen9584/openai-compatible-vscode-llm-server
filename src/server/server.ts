import express from 'express';
import { Server as HttpServer } from 'http';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { StatusBarManager } from '../statusBar/statusBar';
import modelsRouter from './routes/models';
import chatRouter from './routes/chat';

export class ServerManager {
    private static instance: ServerManager;
    private server: HttpServer | undefined;
    private app: express.Application;
    private logger: Logger;
    private statusBar: StatusBarManager;

    private constructor(logger: Logger, statusBar: StatusBarManager) {
        this.app = express();
        this.logger = logger;
        this.statusBar = statusBar;
        this.setupMiddleware();
        this.setupRoutes();
    }

    public static initialize(logger: Logger, statusBar: StatusBarManager): ServerManager {
        if (!ServerManager.instance) {
            ServerManager.instance = new ServerManager(logger, statusBar);
        }
        return ServerManager.instance;
    }

    public static getInstance(): ServerManager {
        if (!ServerManager.instance) {
            throw new Error('ServerManager not initialized');
        }
        return ServerManager.instance;
    }

    private setupMiddleware(): void {
        this.app.use(express.json());
        
        // Custom middleware for request logging and CORS
        this.app.use('/v1', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            if (req.method === 'OPTIONS') {
                res.status(200).end();
                return;
            }

            this.logger.log(`Incoming ${req.method} request to ${req.path}`);
            next();
        });

        // Global error handling middleware
        this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            this.logger.log(`Error caught in middleware: ${err.message}`);
            if (!res.headersSent) {
                res.status(500).json({
                    error: {
                        message: err.message || 'Internal server error',
                        type: 'server_error'
                    }
                });
            }
        });
    }

    private setupRoutes(): void {
        this.app.use('/v1/models', modelsRouter(this.logger));
        this.app.use('/v1/chat', chatRouter(this.logger));
    }

    public start(): boolean {
        if (this.server) {
            this.logger.log('Server start attempted while already running');
            vscode.window.showInformationMessage('Server is already running');
            return false;
        }

        const config = vscode.workspace.getConfiguration('openaiCompatibleServer');
        const port = config.get('port', 3775);

        this.server = this.app.listen(port, () => {
            this.logger.log(`Server started on port ${port}`);
            vscode.window.showInformationMessage(`OpenAI compatible server running on http://localhost:${port}`);
            this.statusBar.update(true);
        });

        return true;
    }

    public stop(): boolean {
        if (!this.server) {
            this.logger.log('Server stop attempted while not running');
            vscode.window.showInformationMessage('Server is not running');
            return false;
        }

        this.server.close();
        this.server = undefined;
        this.logger.log('Server stopped');
        vscode.window.showInformationMessage('OpenAI compatible server stopped');
        this.statusBar.update(false);
        return true;
    }

    public isRunning(): boolean {
        return this.server !== undefined;
    }

    public getServerPort(): number {
        const config = vscode.workspace.getConfiguration('openaiCompatibleServer');
        return config.get('port', 3775);
    }
}
