const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const GameDay = require("../models/GameDay");
const Player = require("../models/Player");
const User = require("../models/User");
const protect = require("../middleware/auth");

const TEAM_NAMES = ["Green", "Blue", "Yellow", "Red"];
const CORE_POSITIONS = ["defender", "midfielder", "forward"];
const TEAM_SIZE = 7;
const MAX_PLAYERS = 28;

// --------------------------------------------------
// ADMIN AUTHORIZATION
// --------------------------------------------------

// protect verifies the JWT.
// This middleware also verifies the user's current
// role in MongoDB rather than trusting the token alone.
async function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select("role");

    if (!user || user.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required.",
      });
    }

    next();
  } catch (err) {
    console.error("Admin authorization error:", err);
    res.status(500).json({
      message: "Could not verify admin access.",
    });
  }
}

// --------------------------------------------------
// POSITION HELPERS
// --------------------------------------------------

function normalizePosition(position = "") {
  const value = position.toLowerCase().trim();

  if (value.includes("defend")) return "defender";
  if (value.includes("midfield")) return "midfielder";
  if (value.includes("forward") || value.includes("striker")) {
    return "forward";
  }
  if (value.includes("goalkeeper") || value === "gk") {
    return "goalkeeper";
  }

  return "other";
}

function getTeamMembers(players, team) {
  return players.filter((player) => player.team === team);
}

function missingCorePositions(players, team) {
  const members = getTeamMembers(players, team);

  return CORE_POSITIONS.filter(
    (position) =>
      !members.some(
        (player) => normalizePosition(player.position) === position,
      ),
  );
}

// --------------------------------------------------
// AUTOMATIC TEAM ALLOCATION
// --------------------------------------------------

// --------------------------------------------------
// AUTOMATIC TEAM ALLOCATION
// --------------------------------------------------

function allocateEligiblePlayers(players) {
  // Only allocate players whose entry fee is confirmed,
  // who have checked in, and who do not have a team.
  const unassigned = players
    .filter(
      (player) =>
        player.paymentConfirmed &&
        player.checkedIn &&
        !player.team,
    )
    .sort((a, b) => {
      const order = {
        defender: 1,
        midfielder: 2,
        forward: 3,
        goalkeeper: 4,
        other: 5,
      };

      return (
        order[normalizePosition(a.position)] -
        order[normalizePosition(b.position)]
      );
    });

  const heldPlayers = [];

  while (unassigned.length > 0) {
    // Only consider teams with available places.
    const availableTeams = TEAM_NAMES.filter(
      (team) => getTeamMembers(players, team).length < TEAM_SIZE,
    );

    // No team has space left.
    if (availableTeams.length === 0) {
      heldPlayers.push(...unassigned);
      break;
    }

    // First prioritize players who can fill a missing
    // defender, midfielder, or forward position.
    const priorityIndex = unassigned.findIndex((player) => {
      const position = normalizePosition(player.position);

      return (
        CORE_POSITIONS.includes(position) &&
        availableTeams.some((team) =>
          missingCorePositions(players, team).includes(position),
        )
      );
    });

    const playerIndex = priorityIndex >= 0 ? priorityIndex : 0;
    const [player] = unassigned.splice(playerIndex, 1);

    const position = normalizePosition(player.position);
    const isCorePosition = CORE_POSITIONS.includes(position);

    // Prefer teams where this player fills a missing
    // core position while preserving space for other
    // missing core positions whenever possible.
    const safeCandidates = availableTeams.filter((team) => {
      const members = getTeamMembers(players, team);
      const missingBefore = missingCorePositions(players, team);

      const missingAfter = isCorePosition
        ? missingBefore.filter((missing) => missing !== position)
        : missingBefore;

      return members.length + 1 + missingAfter.length <= TEAM_SIZE;
    });

    // If no team satisfies every reservation rule,
    // use any team with space rather than unnecessarily
    // leaving the player unassigned.
    const candidates =
      safeCandidates.length > 0
        ? safeCandidates
        : availableTeams;

    candidates.sort((teamA, teamB) => {
      const missingA = missingCorePositions(players, teamA);
      const missingB = missingCorePositions(players, teamB);

      const needsA =
        isCorePosition && missingA.includes(position) ? 1 : 0;

      const needsB =
        isCorePosition && missingB.includes(position) ? 1 : 0;

      // First, prioritize teams that need this position.
      if (needsA !== needsB) {
        return needsB - needsA;
      }

      // When filling a missing core position, prioritize
      // teams with more missing core positions.
      // Otherwise, prefer teams that already have their
      // core positions covered.
      if (needsA && needsB && missingA.length !== missingB.length) {
        return missingB.length - missingA.length;
      }

      if (!needsA && !needsB && missingA.length !== missingB.length) {
        return missingA.length - missingB.length;
      }

      // Keep team sizes balanced.
      const countA = getTeamMembers(players, teamA).length;
      const countB = getTeamMembers(players, teamB).length;

      if (countA !== countB) {
        return countA - countB;
      }

      // Use a consistent tie-breaker.
      return TEAM_NAMES.indexOf(teamA) - TEAM_NAMES.indexOf(teamB);
    });

    // Assign the player to the best available team.
    player.team = candidates[0];
  }

  return heldPlayers;
}
// --------------------------------------------------
// RETRYABLE GAME-DAY UPDATE
// --------------------------------------------------

// Uses the GameDay document version to avoid silently
// overwriting simultaneous changes from two gate admins.
async function updateGameDay(gameDayId, mutate) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const gameDay = await GameDay.findById(gameDayId);

    if (!gameDay) {
      const error = new Error("Game day not found.");
      error.status = 404;
      throw error;
    }

    const expectedVersion = gameDay.__v || 0;

    await mutate(gameDay);

    // Convert the modified player subdocuments into plain objects.
    const playersToSave = gameDay.players.map((entry) =>
      entry.toObject ? entry.toObject() : entry,
    );

    const updated = await GameDay.findOneAndUpdate(
      {
        _id: gameDay._id,
        __v: expectedVersion,
      },
      {
        $set: {
          players: playersToSave,
          title: gameDay.title,
          date: gameDay.date,
          entryFee: gameDay.entryFee,
          maxPlayers: gameDay.maxPlayers,
          teamSize: gameDay.teamSize,
          status: gameDay.status,
        },
        $inc: { __v: 1 },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (updated) {
      return updated;
    }
  }

  const error = new Error(
    "Another gate update happened at the same time. Please try again.",
  );
  error.status = 409;
  throw error;
}

// --------------------------------------------------
// CREATE GAME DAY — ADMIN ONLY
// --------------------------------------------------

router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { title, date, entryFee } = req.body;

    if (!title || !date || Number.isNaN(Date.parse(date))) {
      return res.status(400).json({
        message: "A valid game title and date are required.",
      });
    }

    // Only one game day can be active at a time.
    const activeGame = await GameDay.findOne({ status: "active" });

    if (activeGame) {
      return res.status(409).json({
        message: "Close the current active game day first.",
      });
    }

    const gameDay = await GameDay.create({
      title,
      date: new Date(date),
      entryFee: 200,
      maxPlayers: MAX_PLAYERS,
      teamSize: TEAM_SIZE,
      status: "upcoming",
      createdBy: req.user.id,
    });

    res.status(201).json(gameDay);
  } catch (err) {
    console.error("Create game day error:", err);
    res.status(500).json({
      message: err.message || "Could not create game day.",
    });
  }
});

// --------------------------------------------------
// ADMIN: LIST GAME DAYS
// --------------------------------------------------

router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const gameDays = await GameDay.find()
      .select("title date entryFee maxPlayers teamSize status createdAt")
      .sort({ date: -1 })
      .lean();

    res.json(gameDays);
  } catch (err) {
    console.error("List game days error:", err);

    res.status(500).json({
      message: "Could not load game days.",
    });
  }
});

// --------------------------------------------------
// ADMIN: GET GAME DAY DETAILS
// --------------------------------------------------

router.get("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid game day ID." });
    }

    const gameDay = await GameDay.findById(req.params.id);

    if (!gameDay) {
      return res.status(404).json({ message: "Game day not found." });
    }

    // This endpoint is admin-only and may include
    // payment status and arrival times.
    res.json(gameDay);
  } catch (err) {
    res.status(500).json({ message: "Could not load game day." });
  }
});

// --------------------------------------------------
// ADMIN: ACTIVATE OR CLOSE A GAME DAY
// --------------------------------------------------

router.patch("/:id/status", protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["upcoming", "active", "closed"].includes(status)) {
      return res.status(400).json({ message: "Invalid game-day status." });
    }

    const gameDay = await GameDay.findById(req.params.id);

    if (!gameDay) {
      return res.status(404).json({ message: "Game day not found." });
    }

    if (status === "active") {
      const anotherActiveGame = await GameDay.findOne({
        status: "active",
        _id: { $ne: gameDay._id },
      });

      if (anotherActiveGame) {
        return res.status(409).json({
          message: "Another game day is already active.",
        });
      }
    }

    gameDay.status = status;
    await gameDay.save();

    res.json({
      message: `Game day ${status}.`,
      gameDay,
    });
  } catch (err) {
    res.status(500).json({ message: "Could not update game-day status." });
  }
});

// --------------------------------------------------
// ADMIN: SEARCH REGISTERED PLAYERS
// --------------------------------------------------

// --------------------------------------------------
// ADMIN: SEARCH REGISTERED PLAYERS
// --------------------------------------------------

router.get("/:id/search-players", protect, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid game day ID.",
      });
    }

    const gameDay = await GameDay.findById(id);

    if (!gameDay) {
      return res.status(404).json({
        message: "Game day not found.",
      });
    }

    const search = String(req.query.search || "").trim();

    // Treat the search term as text, not as a regular expression
    // supplied by the user.
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const query = search
      ? { name: { $regex: escapedSearch, $options: "i" } }
      : {};

    const players = await Player.find(query)
      .select("_id name position avatar paid played")
      .sort({ name: 1 })
      .limit(50)
      .lean();

    const results = players.map((player) => {
      const existingEntry = gameDay.players.find(
        (entry) =>
          entry.playerId.toString() === player._id.toString(),
      );

      // Preserve the existing financial calculation.
      const paid = Number(player.paid || 0);
      const played = Number(player.played || 0);

      const accountCredit = Math.max(
        0,
        paid - played * 200,
      );

      return {
        id: player._id,
        name: player.name,
        position: player.position || "",
        avatar: player.avatar || "",

        accountCredit,
        canUseAccountCredit:
          accountCredit >= gameDay.entryFee,

        alreadyAdded: Boolean(existingEntry),
        paymentConfirmed:
          existingEntry?.paymentConfirmed || false,
        checkedIn: existingEntry?.checkedIn || false,
        team: existingEntry?.team || null,
      };
    });

    res.set("Cache-Control", "no-store");
    return res.json(results);
  } catch (err) {
    console.error("Player search error:", err);

    return res.status(500).json({
      message: "Player search failed.",
    });
  }
});
// --------------------------------------------------
// ADMIN: CONFIRM THIS GAME DAY'S ENTRY FEE
// --------------------------------------------------
// --------------------------------------------------
// ADMIN: CONFIRM THIS GAME DAY'S ENTRY FEE
// --------------------------------------------------

router.patch(
  "/:id/players/:playerId/payment",
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const { id, playerId } = req.params;

      if (
        !mongoose.isValidObjectId(id) ||
        !mongoose.isValidObjectId(playerId)
      ) {
        return res.status(400).json({ message: "Invalid ID." });
      }

      const player =
        await Player.findById(playerId).select("_id name position");

      if (!player) {
        return res.status(404).json({ message: "Player not found." });
      }

      const gameDay = await GameDay.findOne({
        _id: id,
        status: "active",
      });

      if (!gameDay) {
        return res.status(409).json({
          message: "The game day must be active.",
        });
      }

      const existingRecord = gameDay.players.find(
        (entry) => entry.playerId.toString() === player._id.toString(),
      );

      if (existingRecord) {
        const result = await GameDay.updateOne(
          {
            _id: id,
            status: "active",
            players: {
              $elemMatch: { playerId: player._id },
            },
          },
          {
            $set: {
              "players.$.paymentConfirmed": true,
            },
          },
        );

        if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
          return res.status(409).json({
            message: "Payment confirmation was not saved. Please try again.",
          });
        }
      } else {
        // Add a new record with payment confirmed.
        const result = await GameDay.updateOne(
          {
            _id: id,
            status: "active",
            players: {
              $not: {
                $elemMatch: { playerId: player._id },
              },
            },
          },
          {
            $push: {
              players: {
                playerId: player._id,
                playerName: player.name,
                position: player.position || "",
                entryFee: gameDay.entryFee,
                paymentConfirmed: true,
                checkedIn: false,
                arrivalTime: null,
                team: null,
              },
            },
          },
        );

        if (result.matchedCount !== 1) {
          return res.status(409).json({
            message:
              "The game-day record changed during payment confirmation. Please try again.",
          });
        }
      }

      // Read back the persisted value before reporting success.
      const updatedGameDay = await GameDay.findById(id);

      const savedRecord = updatedGameDay?.players.find(
        (entry) => entry.playerId.toString() === player._id.toString(),
      );

      if (!savedRecord || savedRecord.paymentConfirmed !== true) {
        return res.status(500).json({
          message: "Payment confirmation could not be verified.",
        });
      }

      return res.json({
        message: "Entry fee confirmed for this game day.",
        playerId: player._id,
        paymentConfirmed: true,
        checkedIn: savedRecord.checkedIn,
        team: savedRecord.team || null,
      });
    } catch (err) {
      console.error("Payment confirmation error:", err);

      return res.status(err.status || 500).json({
        message: err.message || "Could not confirm payment.",
      });
    }
  },
);

// --------------------------------------------------
// ADMIN: CHECK IN PLAYER AND ALLOCATE AUTOMATICALLY
// --------------------------------------------------

// --------------------------------------------------
// ADMIN: CHECK IN PLAYER AND ALLOCATE AUTOMATICALLY
// --------------------------------------------------

router.post(
  "/:id/players/:playerId/check-in",
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const { id, playerId } = req.params;

      if (
        !mongoose.isValidObjectId(id) ||
        !mongoose.isValidObjectId(playerId)
      ) {
        return res.status(400).json({
          message: "Invalid ID.",
        });
      }

      const player = await Player.findById(playerId).select(
        "_id name position",
      );

      if (!player) {
        return res.status(404).json({
          message: "Player not found.",
        });
      }

      const gameDay = await updateGameDay(id, async (game) => {
        if (game.status !== "active") {
          const error = new Error("The game day must be active.");
          error.status = 409;
          throw error;
        }

        const record = game.players.find(
          (entry) =>
            entry.playerId.toString() === player._id.toString(),
        );

       
        if (!record || !record.paymentConfirmed) {
          const error = new Error(
            "Confirm this game's entry fee before checking in the player.",
          );
          error.status = 409;
          throw error;
        }

        // Update the player's details.
        record.playerName = player.name;
        record.position = player.position || "";

        // First, try assigning any eligible players who are
        // already checked in but still have no team.
        allocateEligiblePlayers(game.players);

        // If this player is already checked in and assigned,
        // do not record another arrival.
        if (record.checkedIn && record.team) {
          return;
        }

        // Only new check-ins need to pass the capacity check.
        if (!record.checkedIn) {
          const assignedCount = game.players.filter(
            (entry) => entry.team,
          ).length;

          if (assignedCount >= MAX_PLAYERS) {
            const error = new Error(
              "All 28 team places are full.",
            );
            error.status = 409;
            throw error;
          }

          // Record the player's first check-in.
          record.checkedIn = true;
          record.arrivalTime = new Date();
        }

        // Allocate this player and any other eligible,
        // checked-in players who do not yet have a team.
        allocateEligiblePlayers(game.players);
      });

      // IMPORTANT: This code runs after updateGameDay()
      // has successfully saved the game-day changes.
      const checkedInRecord = gameDay.players.find(
        (entry) =>
          entry.playerId.toString() === player._id.toString(),
      );

      if (!checkedInRecord || !checkedInRecord.team) {
        return res.status(409).json({
          message:
            "No team places are available to assign this player.",
          checkedIn: Boolean(checkedInRecord?.checkedIn),
          assignedTeam: null,
        });
      }

      return res.json({
        message: `${player.name} checked in and assigned to ${checkedInRecord.team}.`,
        checkedIn: true,
        assignedTeam: checkedInRecord.team,
      });
    } catch (err) {
      console.error("Check-in error:", err);

      return res.status(err.status || 500).json({
        message: err.message || "Could not check in player.",
      });
    }
  },
);

// --------------------------------------------------
// PUBLIC LIVE TEAM BOARD
// --------------------------------------------------

// No protect middleware: club members can view the board.
// IMPORTANT: Only explicitly selected safe fields are returned.
router.get("/public/active", async (req, res) => {
  try {
    const gameDay = await GameDay.findOne({ status: "active" })
      .sort({ date: -1 })
      .lean();

    if (!gameDay) {
      return res.status(404).json({
        message: "There is no active game day.",
      });
    }

    const teams = TEAM_NAMES.map((team) => {
      const members = gameDay.players
        .filter((player) => player.team === team)
        .map((player) => ({
          name: player.playerName,
          position: player.position || "",
        }));

      return {
        name: team,
        count: members.length,
        capacity: TEAM_SIZE,
        players: members,
      };
    });

    res.set("Cache-Control", "no-store");

    res.json({
      title: gameDay.title,
      date: gameDay.date,
      status: gameDay.status,
      totalAssigned: teams.reduce((sum, team) => sum + team.count, 0),
      totalCapacity: MAX_PLAYERS,
      teams,
    });
  } catch (err) {
    console.error("Public team board error:", err);
    res.status(500).json({ message: "Could not load team board." });
  }
});

module.exports = router;
