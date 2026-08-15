import axios from "axios";
import { HTTP_SERVER_BASE_URL } from "./config";

const api = axios.create({
    baseURL: HTTP_SERVER_BASE_URL,
    withCredentials: true,
});

export default api;