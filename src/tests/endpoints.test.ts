import request from "supertest";
import { ChildProcess, spawn } from "child_process";
import { exit } from "process";
import { randomBytes } from "crypto";

import {AppHandler} from "../app";
import { DatabaseHandler } from "../db_handler";
import pgPromise from "pg-promise";


const pgp = pgPromise();

const db = pgp({
    host: "localhost",
    port: 5432,
    database: "TestsMessageRoom", // pending
    password: undefined,
    max: 30,
});

const databaseHandler = new DatabaseHandler(db)
let appHandler: AppHandler;

class RedisServerProcess {
    private redisProcess: () => ChildProcess;
    private processHandler: ChildProcess | null = null;
    constructor() {
        this.redisProcess = () => spawn("redis-server");
    }

    public start(): void {
        this.processHandler = this.redisProcess();
        console.log("redis-server process started");

        // this.processHandler.once("exit", () => {
        //     console.log("Process stopped (alegedlly)");
        // });
        //
        this.processHandler.on("error", (data) => {
            console.log(`An error has occurred: ${data}`);
            exit(1);
        });
    }

    public kill(): void {
        if (process === null) {
            console.log("You haven't started the process, aborting");
            exit(1);
        }

        this.processHandler!.kill();
    }
}

const redisServerProcess = new RedisServerProcess();

beforeAll(async () => {
    redisServerProcess.start();
    appHandler = await AppHandler.init(databaseHandler);
    await appHandler.redisClient.connect();
});

afterAll(() => {
    appHandler.redisClient.destroy();
    redisServerProcess.kill();
});

describe("Testing the GET endpoints of the application", () => {
    it("Get a 200 response when requesting '/' if you have an authorization cookie", async () => {
        const sessionId = randomBytes(32).toString("hex");
        try {
            await appHandler.redisClient.set(sessionId, 1);
        } catch (error) {
            console.log(`An error has ocurred: ${error}`);
            exit(1);
        }

        await request(appHandler.app)
            .get("/")
            .set("Cookie", [`id=${sessionId}`])
            .expect(200);
    });

    it("Get a 302 redirection for normal requests to '/' (with no authorization cookie)", async () => {
        const response = await request(appHandler.app).get("/");
        expect(response.status).toBe(302);
        expect(response.header.location).toBe("/login");
    });

    it("Get a 302 if the cookie is not valid", async () => {
        const sessionId = randomBytes(32).toString("hex");
        await request(appHandler.app)
            .get("/")
            .set("Cookie", [`id=${sessionId}`])
            .expect(302)
            .expect("Location", "/login");
    });
});

describe("Testing the POST endpoints of the application", () => {
    it("Get a 200 for introducing new credentials in the signin process", async () => {
        const credentials = {
            fullname: "signinExample1",
            email: "new@signing.com",
            password: "password321",
        };

        // For this tests to always work, it is necessary that the user with the
        // "fullname" value in the credentials objects is not registered in the
        // database. Also, the users rows are constraint to delete their
        // corresponding related row in the credentials table.
        await db.none("DELETE FROM users WHERE user_name=$1", [
            credentials.fullname,
        ]);

        await request(appHandler.app)
            .post("/signin")
            .type("form")
            .send(credentials)
            .expect(302)
            .expect("Location", "/");
    });

    it("Get a 401 when introducing credentials that already exist when '/signin'", async () => {
        const credentials = {
            fullname: "signinExample2",
            email: "signingexisting@credentials.com",
            password: "password123",
        };

        try {
            await databaseHandler.introduceCredentials(
                credentials.fullname,
                credentials.email,
                credentials.password,
            );
        } catch (err) {
            // fallback
        }

        const response = await request(appHandler.app)
            .post("/signin")
            .type("form")
            .send(credentials);

        expect(response.status).toBe(409);
        expect(
            response.text.includes(
                "Sorry, the username you introduced is already in use",
            ),
        ).toBe(true);
    });

    it("Get a 401 for introducing a non-registered email", async () => {
        const response = await request(appHandler.app).post("/login").type("form").send({
            email: "test@example.com",
            password: "secret123",
        });

        expect(response.status).toBe(401);
        expect(
            response.text.includes("There's no account with this email yet"),
        ).toBe(true);
    });

    it("Get a 401 for introducing a valid email but incorrect password", async () => {
        const validCredentials = {
            userName: "exampleLogin",
            email: "test1@example.com",
            password: "password123",
        };

        try {
            await databaseHandler.introduceCredentials(
                validCredentials.userName,
                validCredentials.email,
                validCredentials.password,
            );
        } catch (err) {
            // The mock credentials were already introduced, so no need to do it
            // again, this is just a fallback
        }

        const response = await request(appHandler.app).post("/login").type("form").send({
            email: validCredentials.email,
            password: "notpassword123",
        });

        expect(response.status).toBe(401);
        expect(
            response.text.includes(
                "Introduced password does not match with the email",
            ),
        ).toBe(true);
    });
});
