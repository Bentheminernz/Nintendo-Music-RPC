import { createLogger } from "../utils/logger";
import { Request, Response } from 'express';

const log = createLogger('httpServer');

/** A base class for an HTTP Server 
 * Based on the implementation from nxapi, with some modifications:
 * @link https://github.com/samuelthomas2774/nxapi/blob/main/src/util/http-server.ts
*/
export class HttpServer {
    protected createApiRequestHandler(callback: (req: Request, res: Response) => Promise<{} | void>) {
        return async (req: Request, res: Response) => {
            try {
                const result = await callback.call(null, req, res);
                if (result) this.sendJsonResponse(res, result);
                else res.end();
            } catch (err) {
                log.error('Error in request %s %s', req.method, req.url, err);
                this.sendJsonResponse(res, { error: String(err) }, 500);
            }
        };
    }

    protected sendJsonResponse(res: Response, data: {}, status?: number) {
        if (status) res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    }
}
