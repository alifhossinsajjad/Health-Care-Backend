
import { Server } from "node:http";
import dotenv from "dotenv";
import app from "./app";
dotenv.config();

let server: Server;
const PORT = process.env.PORT;



async function main() {
    try {

        server = app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        })

    } catch (error) {
        console.log("Failed to connect to database", error);
    }
}

main();