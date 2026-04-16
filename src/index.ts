import { readFileSync } from "fs";
import { findBaseDirectory, AppHandler} from "./app";
import { DatabaseHandler } from "./db_handler";
import { createServer } from "https";
import { WebSocketServer } from "ws";
import pgPromise from "pg-promise";

const pgp = pgPromise();

const db = pgp({
    host: "localhost",
    port: 5432,
    database: "MessageRoom", // pending
    password: undefined,
    max: 30,
});


const BUILD_DIR = findBaseDirectory() + "/build/";

const httpsOptions = {
    key: readFileSync(BUILD_DIR + "server.key"),
    cert: readFileSync(BUILD_DIR + "server.cert"),
};

async function initServer() {
    const appHandler = await AppHandler.init(new DatabaseHandler(db))

    const server = createServer(httpsOptions, appHandler.app);
    server.on("upgrade", async function (req, socket, _) {
        const unauthorizedResponse = `HTTP/1.1 401 Unauthorized\r
        WWW-Authenticate: Basic realm="Access to the site"\r
        Content-Type: text/plain\r
        Content-Length: 23\r
        \r
        Unauthorized access denied`;

        let clientsCookie = req.headers.cookie;
        if (!clientsCookie) {
            socket.write(unauthorizedResponse);
            socket.destroy();
            return;
        }

        let sessionID = clientsCookie.match(/(?<=id=)\w+/);

        if (!sessionID || !sessionID[0]) {
            socket.write(unauthorizedResponse);
            socket.destroy();
        } else {
            let sessionExists = appHandler.redisClient.get(sessionID[0]);
            if (!sessionExists) {
                socket.write(unauthorizedResponse);
                socket.destroy();
            }
        }
    });

    const wss = new WebSocketServer({ server, path: "/ws" });

    wss.on("connection", function (ws, _) {
        ws.on("error", () => console.log("There was an error"));

        ws.on("message", function (msg) {
            console.log(new String(msg));
            // I noticed that is not necesary to parse the RawData type when
            // sending it with a string in the "send" method
            wss.clients.forEach((client) => client.send(`${msg}`));
        });
    });


    server.listen(8080, () => {
        console.log("HTTPs server started, listening on port 8080");
        appHandler.redisClient.on("error", (err) => {
            console.log("Redis client error:");
            console.error(err);
        });
        appHandler.redisClient.connect().then(() => console.log("redis client started"));
    });
};

initServer();
