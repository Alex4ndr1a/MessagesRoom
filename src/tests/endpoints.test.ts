import request from "supertest";
// import { spawn } from "child_process";

import { app, redisClient } from "../app";
import { ChildProcess, spawn } from "child_process";
import { exit } from "process";
import { randomBytes } from "crypto";
import { response } from "express";

class RedisProcess {
    private redisProcess: () => ChildProcess;
    private processHandler: ChildProcess | null = null;
    constructor() {
        this.redisProcess = () => spawn("redis-server");
    }

    public startProcess(): void {
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

    public killProcess(): void {
        if (process === null) {
            console.log("You haven't started the process, aborting");
            exit(1);
        }

        this.processHandler!.kill();
    }
}

const redisProcess = new RedisProcess();

beforeAll(() => {
    redisProcess.startProcess();
    return redisClient.connect();
});

afterAll(() => {
    redisClient.destroy();
    redisProcess.killProcess();
});


describe("Testing the GET endpoints of the application", () => {
    it("Get a 200 response when requesting '/' if you have an authorization cookie", async() => {
        const sessionId = randomBytes(32).toString("hex");
        try {
            await redisClient.set(sessionId, 1);
        } catch (error) {
            console.log(`An error has ocurred: ${error}`);
            exit(1);
        } 

        const response = await request(app).get("/").set("Cookie", [`id=${sessionId}`]);
        expect(response.status).toBe(200);
    });

    it("Get a 302 redirection for normal requests to '/' (with no authorization cookie)", async() => {
        const response = await request(app).get("/");
        expect(response.status).toBe(302);
        expect(response.header.location).toBe("/login");
    });

    it("Get a 302 if the cookie is not valid", async() => {
        const sessionId = randomBytes(32).toString("hex");
        await request(app).get("/").set("Cookie", [`id=${sessionId}`])
        .expect(302)
        .expect("Location", "/login");
    });

    it("Get a 401 for introducing credentials to signin into the application", async() => {
        const response = await request(app)
        .post('/login')
        .type('form')
        .send({
            email: 'test@example.com',
            password: 'secret123'
        });

        expect(response.status).toBe(401);
        expect(response.text.includes("There's no account with this email yet")).toBe(true);
    });
});
