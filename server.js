import "dotenv/config";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { startPostCleanupScheduler } from "./src/services/postCleanup.service.js";

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
    startPostCleanupScheduler();
    app.listen(PORT, () => {
        console.log("Server listening on http://localhost:3000");
    })
}).catch((error) => {
    console.error("ERROR: Failed to connect to the database. Make sure the database is up and running!");
})