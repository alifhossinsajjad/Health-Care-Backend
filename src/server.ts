
import { Server } from "node:http";
import dotenv from "dotenv";
import app from "./app";
import { envVars } from "./config/env";
dotenv.config();

let server: Server;


async function main() {
    try {

        server = app.listen(envVars.PORT, () => {
            console.log(`Server is running on port ${envVars.PORT}`);
        })

    } catch (error) {
        console.log("Failed to connect to database", error);
    }
}

main();