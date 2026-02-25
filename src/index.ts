import server, {redisClient} from "./app";
import { initDataBase } from "./db_handler";

server.listen(8080, () => {
    console.log("HTTPs server started");
    initDataBase().then(() => console.log("initDatabase executed"));
    redisClient.on("error", (err) => {
        console.log("Redis client error:");
        console.error(err);
    });
    redisClient.connect().then(() => console.log("redis client started"));
});
