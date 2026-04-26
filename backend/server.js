const express = require("express");
const cors = require("cors");
const professorRoutes = require("./routes/professorRoutes");

const app = express();

const allowedOrigins = [
  "https://cmsweb.cms.cpp.edu"
];

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.endsWith(".cpp.edu")) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.options("*", cors());

app.use(express.json());

app.use("/api/professor", professorRoutes);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "BroncoSort backend" });
});

app.get("/", (req, res) => {
  res.send("BroncoSort backend is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
