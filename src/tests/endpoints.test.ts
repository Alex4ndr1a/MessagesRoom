import request from "supertest";
// import { spawn } from "child_process";

import app from "../index";


describe("Testing the GET endpoints of the application", () => {
    it("Get a 302 redirection for normal requests to '/' (with no authorization cookie)", async() => {
        const response = await request(app).get("/").send();
        expect(response.status).toBe(302);
        expect(response.header.location).toBe("/login");
    });

    afterAll(() => {
        setTimeout(() => {
            process.exit(0);
        }, 0);
    });
});
