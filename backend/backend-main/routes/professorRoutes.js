const express = require("express");
const router = express.Router();
const {
  getProfessorRatings,
  getProfessorSummary,
} = require("../controllers/professorController");

router.post("/ratings", getProfessorRatings);
router.post("/summary", getProfessorSummary);

module.exports = router;
