import express, { Request, Response, NextFunction } from "express"
import { existsSync, readFileSync, statSync } from "fs";
import * as https from "https";
import { WebSocketServer } from "ws";
import cookieParser from "cookie-parser";
import { initDataBase, introduceCredentials, loginUser } from "./db_handler";
import { randomBytes } from "crypto";
import { createClient } from "redis";
import path from "path";

const app = express();
const redisClient = createClient();

function findBaseDirectory(processDir = process.cwd()): string | null {
  let currentDir = statSync(processDir).isDirectory()
    ? processDir
    : path.dirname(processDir);

  while (true) {
    const candidate = path.join(currentDir, "package.json");

    if (existsSync(candidate)) {
      return path.dirname(candidate);
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;

    currentDir = parentDir;
  }

  return null;
}

const BUILD_DIR = findBaseDirectory() + "/build/";
const PUBLIC_DIR = findBaseDirectory() + "/public/";
const REACT_DIR = PUBLIC_DIR + "/app/";

const SESSION_DURATION = 60 * 60 * 24 * 7 * 1000 // Seven days

const sessionDates = () => {
	const now = new Date();
	now.setUTCDate(now.getUTCDate() + 7);
	return now;
}

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR));

const VALIDURLS = "^(/signin|/login|/)$";

function isValidUrl(req: Request, res: Response, next: NextFunction): void {
	// This isn't gonna be good for when I create chatrooms with the resource
	// "/chatroom/{chatroom_id}, because the matches will become complicated,
	// unless I decide to first verify that the url starts first with
	// "/chatroom" resource
	if (req.method === "GET" && !req.url.match(VALIDURLS)) {
		res.status(401).send("Resource doesn't exists");
		return;
	}

	return next();
}

function authorizeUser(req: Request, res: Response, next: NextFunction): void {
	if (Object.keys(req.cookies).length > 0) { // Object not empty
		// TODO: Make it so the session ids last a certain amount of time,
		// and then make it so with every request to the website, the session
		// id is refreshed
		redisClient.get(req.cookies.id)
		.then((sessionExists) => {
			if (!sessionExists) {
				res.status(401).redirect("/login");
			} else {
				return next();
			}
		})
		.catch(err => {
			console.log(err);
			res.status(505).send("Internal server error");
		})
	}
	else
		return res.status(401).redirect("/login");
}


app.get("/", authorizeUser, async function(req, res) {
	let sessionId = await redisClient.keys(req.cookies.id);

	let newId = randomBytes(32).toString("hex");
	await redisClient.set(newId, 1, { EX: SESSION_DURATION / 1000 });

	if (sessionId) {
		await redisClient.del(sessionId[0]);
	}

	res
	.cookie("id", `${newId}`, {httpOnly: true, secure: true, expires: sessionDates()})
	.sendFile(REACT_DIR + "index.html");
})

app.use(express.static(REACT_DIR));

app.route("/login")
.get((req, res) => {
	res.sendFile(PUBLIC_DIR + "login/login.html");
})
.post(async function(req, res) {
	try {
		let userName = await loginUser(req.body.email, req.body.password);
		let sessionId = randomBytes(32).toString("hex");

		await redisClient.set(sessionId, 1);

		res.status(200)
		.cookie("id", `${sessionId}`, {httpOnly: true, secure: true, expires: sessionDates()})
		.cookie("username", `${userName}`, {secure: true, expires: sessionDates()}) 
		.redirect("/")
		// I don't know if this is a good way to do it, but its the only way
		// I can think of
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "EMAIL_NOT_FOUND")
				res.status(401).send("There's no account with this email yet\n");
			else if (error.message === "INCORRECT_PASSWORD")
				res.status(401).send("Introduced password does not match with the email\n");
			else
				res.status(505).send("Internal server error");
		}
	}
})

app.route("/signin")
.get((req, res) => {
	res.sendFile(PUBLIC_DIR + "signin/signin.html");
})
.post(async function(req, res) {
	try {
		let userName = await introduceCredentials(req.body.fullname, req.body.email, req.body.password);
		let sessionId = randomBytes(32).toString("hex");

		await redisClient.set(sessionId, 1);
		res.status(200)
		.cookie("id", `${sessionId}`, {httpOnly: true, secure: true, expires: sessionDates()})
		.cookie("username", `${userName}`, {secure: true, expires: sessionDates()}) 
		.redirect("/")
		
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "CREDENTIAL_CONFLICT")
				res.status(409).send("Sorry, the username you introduced is already in use\n");
			else
				res.status(505).send("Server Error, try again later\n");
		}
	}
})


app.use(isValidUrl);

const httpsOptions: https.ServerOptions = {
	key: readFileSync(BUILD_DIR + "server.key"),
	cert: readFileSync(BUILD_DIR + "server.cert"),
}

const server = https.createServer(httpsOptions, app);
server.on("upgrade", async function(req, socket, head) {
	const unauthorizedResponse = 
	`HTTP/1.1 401 Unauthorized\r
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
	console.log(clientsCookie, sessionID);

	if (!sessionID || !sessionID[0]) {
		socket.write(unauthorizedResponse);
		socket.destroy();
		return;
	} else {
		let sessionExists = await redisClient.get(sessionID[0]);
		if (!sessionExists) {
			socket.write(unauthorizedResponse);
			socket.destroy();
			return;
		} else 
			return;
	}
});

const wss = new WebSocketServer({ server, path: "/ws"});

wss.on("connection", function(ws, req) {
	ws.on("error", () => console.log("There was an error"));

	ws.on("message", function(msg) {
		console.log(new String(msg));
		// I noticed that is not necesary to parse the RawData type when
		// sending it with a string in the "send" method
		wss.clients.forEach((client) => client.send(`${msg}`));
	})

});



server.listen(8080, () => {
	console.log("HTTPs server started");
	initDataBase().then(() => console.log("initDatabase executed"));
	redisClient.on("error", err => console.log("Redis client error", err))
	redisClient.connect();
});

export default app;
