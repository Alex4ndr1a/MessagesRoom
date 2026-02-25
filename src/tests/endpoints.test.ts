import request from "supertest";
// import { spawn } from "child_process";

import { app, redisClient } from "../app";
import { ChildProcess, spawn } from "child_process";
import { exit } from "process";
import { randomBytes } from "crypto";

class RedisProcess {
    private redisProcess: () => ChildProcess;
    private activeProcess: ChildProcess | null = null;
    constructor() {
        this.redisProcess = () => spawn("redis-server");
        console.log("redis-server process started");
    }

    public startProcess(): void {
        this.activeProcess = this.redisProcess();

        this.activeProcess.once("exit", () => {
            console.log("Process stopped (alegedlly)");
        });
    }

    public killProcess(): void {
        if (process === null) {
            console.log("You haven't started the process, aborting");
            exit(1);
        }

        this.activeProcess?.kill;
    }
}

const redisProcess = new RedisProcess();

beforeAll(() => {
    redisProcess.startProcess();
    return redisClient.connect();
});

afterAll(() => {
    redisProcess.killProcess();
});


describe("Testing the GET endpoints of the application", () => {
    it("Get a 302 redirection for normal requests to '/' (with no authorization cookie)", async() => {
        const response = await request(app).get("/");
        expect(response.status).toBe(302);
        expect(response.header.location).toBe("/login");
    });

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
});
