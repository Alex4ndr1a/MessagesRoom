import request from "supertest";
// import { spawn } from "child_process";

import { app } from "../app";
import { ChildProcess, spawn } from "child_process";
import { exit } from "process";

class RedisProcess {
    private redisProcess: () => ChildProcess;
    private activeProcess: ChildProcess | null = null;
    constructor() {
        this.redisProcess = () => spawn("redis-server");
        console.log("redis-server process started");
    }

    public startProcess() {
        this.activeProcess = this.redisProcess();

        // this.activeProcess.stdout!.on("data", (data) => {
        //     console.log(new String(data));
        // });
        //
        this.activeProcess.stderr!.on("data", (data) => {
            console.log("An error has ocurred");
            console.log(new String(data));
            exit(1);
        });
    }

    public killProcess(): void  {
        if (process === null) {
            console.log("You haven't started the process, aborting");
            exit(1);
        }
        this.activeProcess!.kill();
        console.log("Process stopped (alegedlly)");
    }
}

const redisProcess = new RedisProcess();

beforeAll(() => {
    return redisProcess.startProcess();
});

afterAll(() => {
    return redisProcess.killProcess();

});

describe("Testing the GET endpoints of the application", () => {
    it("Get a 302 redirection for normal requests to '/' (with no authorization cookie)", async() => {
        const response = await request(app).get("/");
        expect(response.status).toBe(302);
        expect(response.header.location).toBe("/login");
    });
});
