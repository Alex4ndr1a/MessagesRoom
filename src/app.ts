import express, { Request, Response, NextFunction } from "express";
import { existsSync, statSync } from "fs";
import cookieParser from "cookie-parser";
import { introduceCredentials, loginUser } from "./db_handler";
import { randomBytes } from "crypto";
import { createClient } from "redis";
import path from "path";

export const app = express();
export const redisClient = createClient();

export function findBaseDirectory(): string | null {
    const processDir = process.cwd();
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

const PUBLIC_DIR = findBaseDirectory() + "/public/";
const REACT_DIR = PUBLIC_DIR + "app/";

const SESSION_DURATION = 60 * 60 * 24 * 7 * 1000; // Seven days

const sessionDates = () => {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + 7);
    return now;
};

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

async function authorizeUser(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    if (Object.keys(req.cookies).length > 0) {
        let sessionExists: string | null = null;
        try {
            sessionExists = await redisClient.get(req.cookies.id);
        } catch (err) {
            res.status(505).send("Internal server error");
            return;
        }

        if (!sessionExists) {
            res.redirect("/login");
        } else {
            return next();
        }
    } else {
        return res.redirect("/login");
    }
}


app.get("/", authorizeUser, async function (req, res) {
    let sessionId = await redisClient.keys(req.cookies.id);

    let newId = randomBytes(32).toString("hex");
    await redisClient.set(newId, 1, { EX: SESSION_DURATION / 1000 });

    if (sessionId) {
        await redisClient.del(sessionId[0]);
    }

    res.cookie("id", `${newId}`, {
        httpOnly: true,
        secure: true,
        expires: sessionDates(),
    }).sendFile(REACT_DIR + "index.html");
});

app.use(express.static(REACT_DIR));

app.route("/login")
    .get((_, res) => {
        res.sendFile(PUBLIC_DIR + "login/login.html");
    })
    .post(async function (req, res) {
        try {
            let userName = await loginUser(req.body.email, req.body.password);
            let sessionId = randomBytes(32).toString("hex");

            await redisClient.set(sessionId, 1);

            res.status(200)
                .cookie("id", `${sessionId}`, {
                    httpOnly: true,
                    secure: true,
                    expires: sessionDates(),
                })
                .cookie("username", `${userName}`, {
                    secure: true,
                    expires: sessionDates(),
                })
                .redirect("/");
            // I don't know if this is a good way to do it, but its the only way
            // I can think of
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === "EMAIL_NOT_FOUND")
                    res.status(401).send(
                        "There's no account with this email yet\n",
                    );
                else if (error.message === "INCORRECT_PASSWORD")
                    res.status(401).send(
                        "Introduced password does not match with the email\n",
                    );
                else res.status(505).send("Internal server error");
            }
        }
    });

app.route("/signin")
    .get((req, res) => {
        res.sendFile(PUBLIC_DIR + "signin/signin.html");
    })
    .post(async function (req, res) {
        try {
            let userName = await introduceCredentials(
                req.body.fullname,
                req.body.email,
                req.body.password,
            );
            let sessionId = randomBytes(32).toString("hex");

            await redisClient.set(sessionId, 1);
            res.status(200)
                .cookie("id", `${sessionId}`, {
                    httpOnly: true,
                    secure: true,
                    expires: sessionDates(),
                })
                .cookie("username", `${userName}`, {
                    secure: true,
                    expires: sessionDates(),
                })
                .redirect("/");
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === "CREDENTIAL_CONFLICT")
                    res.status(409).send(
                        "Sorry, the username you introduced is already in use\n",
                    );
                else res.status(505).send("Server Error, try again later\n");
            }
        }
    });

app.use(isValidUrl);

export default app;
