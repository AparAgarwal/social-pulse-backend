import mongoose from "mongoose";

const connectDB = async (params) => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Database Connected Successfully!")
    } catch (error) {
        console.error(`${error.name}: ${error.message}`);
        throw error;
    }
}

export default connectDB;