/*
 * File:        scrabble.js
 * Author:      [Your Name]
 * Email:       [your@email.edu]
 * Course:      [Course Number / Name]
 * Assignment:  Final Assignment – One-Line Scrabble Game
 * Date:        Fall 2025
 *
 * Description:
 *   All game logic for the one-line Scrabble game.
 *   Uses jQuery and jQuery UI draggable/droppable.
 *
 * Features:
 *   - Tile bag with correct 100-tile distribution (from ScrabbleTiles array)
 *   - 7 random tiles dealt to rack; rack refills after each word
 *   - Drag tiles from rack onto board squares (jQuery UI drag/drop)
 *   - Tiles dropped outside the board stay in the rack (clone approach)
 *   - Placed tiles are fixed — cannot be moved again
 *   - Adjacency rule: every tile after the first must go next to an existing tile
 *   - Real-time word and score display as tiles are placed
 *   - Bonus squares: Double Letter (sq 4, 12), Triple Word (sq 1, 15),
 *     Center/Double Word star (sq 8)
 *   - Submit Word: validates, scores, clears board, refills rack
 *   - New Deal: swap rack tiles when board is empty
 *   - Restart: full game reset
 *   - Game-over when tile bag and rack are both empty
 *
 * Data sources cited:
 *   - ScrabbleTiles associative array: Prof. Jesse M. Heines, UMass Lowell
 *   - Tile distribution: pieces.json by Ramon Meza & Jason Downing
 *   - Bonus-square layout: https://en.wikipedia.org/wiki/Scrabble
 */

$(document).ready(function () {

    // ----------------------------------------------------------------
    // BOARD ROW DEFINITION  (Row 8 — center row of a standard board)
    //
    //   Index:  0    1    2    3    4    5    6    7
    //           8    9   10   11   12   13   14
    //   Sq #:   1    2    3    4    5    6    7    8
    //           9   10   11   12   13   14   15
    //
    //   Types:
    //     N   — Normal square
    //     DLS — Double Letter Score
    //     CTR — Center star  (counts as Double Word Score)
    //     TWS — Triple Word Score
    //
    //   Reference: https://en.wikipedia.org/wiki/Scrabble
    // ----------------------------------------------------------------
    var BOARD_ROW = [
        "TWS",   // sq 1
        "N",     // sq 2
        "N",     // sq 3
        "DLS",   // sq 4
        "N",     // sq 5
        "N",     // sq 6
        "N",     // sq 7
        "CTR",   // sq 8  — center star, Double Word Score
        "N",     // sq 9
        "N",     // sq 10
        "N",     // sq 11
        "DLS",   // sq 12
        "N",     // sq 13
        "N",     // sq 14
        "TWS"    // sq 15
    ];

    // Path to individual tile JPG images (subfolder, relative to index.html)
    var TILE_PATH = "Scrabble_Tiles/";

    // ----------------------------------------------------------------
    // GAME STATE
    // ----------------------------------------------------------------
    var tileBag    = [];   // Undealt tiles remaining in the bag
    var playerHand = [];   // Tiles currently on the rack
    var boardState = {};   // Key: square index (0-14), Value: {letter, value, tileId}
    var totalScore = 0;
    var tileUID    = 0;    // Unique ID counter for tile elements

    // ----------------------------------------------------------------
    // FISHER-YATES SHUFFLE
    // Randomly reorders array arr in place.
    // Source: https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
    // ----------------------------------------------------------------
    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j   = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i]  = arr[j];
            arr[j]  = tmp;
        }
    }

    // ----------------------------------------------------------------
    // BUILD TILE BAG
    // Creates one tile object per letter according to the official
    // distribution in the ScrabbleTiles associative array provided by
    // Prof. Jesse M. Heines (Scrabble_Pieces_AssociativeArray_Jesse.js).
    // Total: 98 letter tiles + 2 blank tiles = 100 tiles.
    // ----------------------------------------------------------------
    function buildBag() {
        tileBag = [];
        for (var letter in ScrabbleTiles) {
            if (!ScrabbleTiles.hasOwnProperty(letter)) { continue; }
            var count = ScrabbleTiles[letter]["original-distribution"];
            var val   = ScrabbleTiles[letter]["value"];
            for (var i = 0; i < count; i++) {
                tileBag.push({ letter: letter, value: val });
            }
        }
        shuffle(tileBag);
    }

    // ----------------------------------------------------------------
    // BUILD BOARD ROW
    // Creates 15 transparent div elements inside #squares and registers
    // each as a jQuery UI droppable target.
    // ----------------------------------------------------------------
    function buildBoard() {
        var $container = $("#squares");
        $container.empty();
        boardState = {};

        for (var i = 0; i < BOARD_ROW.length; i++) {
            var $sq = $("<div>")
                .addClass("sq")
                .attr("data-index", i)
                .attr("data-type",  BOARD_ROW[i]);
            $container.append($sq);
        }

        // Register every .sq as a drop target
        $(".sq").droppable({
            accept:     ".tile",
            hoverClass: "sq-hover",
            drop: function (event, ui) {
                handleDrop($(this), ui.draggable);
            }
        });

        updateDisplay();
    }

    // ----------------------------------------------------------------
    // DEAL TILES
    // Draws tiles from the bag until the player holds 7 (or bag empties).
    // Only draws as many tiles as needed to top the hand back up to 7.
    // ----------------------------------------------------------------
    function dealTiles() {
        var needed = 7 - playerHand.length;
        for (var i = 0; i < needed; i++) {
            if (tileBag.length === 0) { break; }
            var drawn    = tileBag.pop();
            drawn.id     = "tile-" + (tileUID++);
            playerHand.push(drawn);
        }
        renderRack();
    }

    // ----------------------------------------------------------------
    // RENDER RACK
    // Clears #tile-rack and creates a draggable <img> for each tile
    // currently in the player's hand.
    // ----------------------------------------------------------------
    function renderRack() {
        var $rack = $("#tile-rack");
        $rack.empty();

        playerHand.forEach(function (tile) {
            // Blank tile has its own image; all other tiles use letter image
            var imgSrc = (tile.letter === "_")
                ? TILE_PATH + "Scrabble_Tile_Blank.jpg"
                : TILE_PATH + "Scrabble_Tile_" + tile.letter + ".jpg";

            var $img = $("<img>")
                .addClass("tile")
                .attr("id",          tile.id)
                .attr("src",         imgSrc)
                .attr("alt",         tile.letter)
                .attr("data-letter", tile.letter)
                .attr("data-value",  tile.value)
                .attr("data-tileid", tile.id);

            $rack.append($img);
        });

        // Apply jQuery UI draggable to every tile in the rack.
        // Using helper:"clone" means the ORIGINAL tile stays in the rack
        // while a clone moves with the mouse. If the clone is dropped on
        // an invalid target (or outside the board entirely), it simply
        // disappears and the original tile is unchanged — effectively
        // "bouncing" back to the rack with no extra animation needed.
        $(".tile").draggable({
            helper:  "clone",
            zIndex:  1000,
            opacity: 0.85,
            cursor:  "grabbing",
            start: function () {
                $(this).addClass("tile-dragging");
            },
            stop: function () {
                $(this).removeClass("tile-dragging");
            }
        });
    }

    // ----------------------------------------------------------------
    // HANDLE DROP
    // Called when a tile clone is dropped on a board square.
    // Validates the move; if invalid the drop is silently rejected
    // (clone disappears, original stays in rack).
    // ----------------------------------------------------------------
    function handleDrop($sq, $srcTile) {
        var idx    = parseInt($sq.attr("data-index"));
        var letter = $srcTile.attr("data-letter");
        var value  = parseInt($srcTile.attr("data-value"));
        var tileId = $srcTile.attr("data-tileid");

        // Rule 1: Square must be empty
        if (boardState.hasOwnProperty(idx)) {
            showMsg("That square is already occupied — choose an empty square.", "error");
            return;
        }

        // Rule 2: After the first tile, every new tile must be directly
        //         beside an already-placed tile (no gaps allowed)
        if (Object.keys(boardState).length > 0 && !isAdjacent(idx)) {
            showMsg("Tiles must be placed directly next to each other — no gaps!", "error");
            return;
        }

        // ---- Valid placement ----

        // Record in game state
        boardState[idx] = { letter: letter, value: value, tileId: tileId };

        // Place a non-interactive tile image on the board square
        var $placed = $("<img>")
            .addClass("tile-on-board")
            .attr("src", $srcTile.attr("src"))
            .attr("alt", letter);
        $sq.append($placed);

        // Remove the original tile from the rack DOM and from playerHand
        $srcTile.remove();
        playerHand = playerHand.filter(function (t) { return t.id !== tileId; });

        updateDisplay();
        showMsg("", "");
    }

    // ----------------------------------------------------------------
    // ADJACENCY CHECK
    // Returns true if index idx is immediately beside (±1) any square
    // that already has a tile placed on it.
    // ----------------------------------------------------------------
    function isAdjacent(idx) {
        return boardState.hasOwnProperty(idx - 1) ||
               boardState.hasOwnProperty(idx + 1);
    }

    // ----------------------------------------------------------------
    // SCORE CALCULATION
    // Iterates placed tiles left-to-right.
    // Letter multipliers (DLS) applied per letter.
    // Word multipliers (CTR/DWS, TWS) collected and applied at the end.
    // ----------------------------------------------------------------
    function calcScore() {
        var indices = Object.keys(boardState)
                            .map(Number)
                            .sort(function (a, b) { return a - b; });
        if (indices.length === 0) { return 0; }

        var letterTotal = 0;
        var wordMult    = 1;

        indices.forEach(function (idx) {
            var tile = boardState[idx];
            var type = BOARD_ROW[idx];
            var pts  = tile.value;

            switch (type) {
                case "DLS":               pts      *= 2; break;
                case "TLS":               pts      *= 3; break;
                case "DWS": case "CTR":   wordMult *= 2; break;
                case "TWS":               wordMult *= 3; break;
                // "N" — no bonus
            }
            letterTotal += pts;
        });

        return letterTotal * wordMult;
    }

    // ----------------------------------------------------------------
    // GET CURRENT WORD STRING
    // Returns letters placed on the board in left-to-right order.
    // Blank tile is shown as "?".
    // ----------------------------------------------------------------
    function getCurrentWord() {
        var indices = Object.keys(boardState)
                            .map(Number)
                            .sort(function (a, b) { return a - b; });
        return indices.map(function (i) {
            return (boardState[i].letter === "_") ? "?" : boardState[i].letter;
        }).join("");
    }

    // ----------------------------------------------------------------
    // CONTINUITY CHECK
    // Verifies there are no gaps between placed tiles.
    // The adjacency rule during placement should prevent gaps, but this
    // acts as a safety check before the word is submitted.
    // ----------------------------------------------------------------
    function isContinuous() {
        var arr = Object.keys(boardState)
                        .map(Number)
                        .sort(function (a, b) { return a - b; });
        for (var i = 1; i < arr.length; i++) {
            if (arr[i] !== arr[i - 1] + 1) { return false; }
        }
        return true;
    }

    // ----------------------------------------------------------------
    // UPDATE LIVE DISPLAY
    // Shows the current word and its score in real time as tiles are placed.
    // ----------------------------------------------------------------
    function updateDisplay() {
        var word  = getCurrentWord();
        var score = calcScore();

        if (word.length > 0) {
            // e.g.  "CAT  (5 pts)"
            $("#word-display").text(word + "  (" + score + " pts)");
        } else {
            $("#word-display").text("");
        }
    }

    // ----------------------------------------------------------------
    // SHOW MESSAGE
    // type: "error" | "success" | "info"  (pass "" to clear)
    // ----------------------------------------------------------------
    function showMsg(text, type) {
        $("#message")
            .text(text)
            .removeClass("msg-error msg-success msg-info")
            .addClass(type ? "msg-" + type : "");
    }

    // ================================================================
    // SCORE AND ADVANCE
    // Scores the current word, updates the total, clears the board,
    // and refills the rack. Called only after the word has been validated.
    // ================================================================
    function scoreAndAdvance(word) {
        var wordPts  = calcScore();
        totalScore  += wordPts;

        $("#total-score").text(totalScore);
        $("#submit-btn").prop("disabled", false);

        var pts = wordPts === 1 ? "point" : "points";
        showMsg(
            '"' + word + '" scored ' + wordPts + ' ' + pts +
            '.  Running total: ' + totalScore,
            "success"
        );

        // Clear the board and deal replacement tiles
        boardState = {};
        buildBoard();
        dealTiles();

        // Check for game over
        if (tileBag.length === 0 && playerHand.length === 0) {
            showMsg(
                "All tiles used!  Game over — final score: " + totalScore + " points!",
                "success"
            );
            $("#submit-btn, #deal-btn").prop("disabled", true);
        }
    }

    // ================================================================
    // BUTTON: SUBMIT WORD
    // Validates the word against the free Dictionary API before scoring.
    // Source: https://dictionaryapi.dev/ (no API key required)
    // ================================================================
    $("#submit-btn").on("click", function () {
        var count = Object.keys(boardState).length;

        if (count === 0) {
            showMsg("Place at least one tile on the board first!", "error");
            return;
        }

        if (count < 2) {
            showMsg("You need at least 2 letters to make a word.", "error");
            return;
        }

        if (!isContinuous()) {
            showMsg("Letters must be connected with no gaps!", "error");
            return;
        }

        var word = getCurrentWord();   // uppercase letters on board
        var wordLower = word.toLowerCase();

        // Disable the button while the API call is in flight
        $("#submit-btn").prop("disabled", true);
        showMsg("Checking \"" + word + "\"...", "info");

        // Ask the free Dictionary API whether the word exists.
        // A 200 response means the word is valid; 404 means it is not.
        // If the request fails for any network reason we accept the word
        // so that an offline environment does not block the player.
        $.ajax({
            url:    "https://api.dictionaryapi.dev/api/v2/entries/en/" + wordLower,
            method: "GET",
            success: function () {
                // Word found in dictionary — go ahead and score it
                scoreAndAdvance(word);
            },
            error: function (xhr) {
                $("#submit-btn").prop("disabled", false);
                if (xhr.status === 404) {
                    showMsg('"' + word + '" is not a valid Scrabble word — try again!', "error");
                } else {
                    // Network error / API unreachable — accept the word gracefully
                    showMsg("Dictionary unavailable (offline?) — word accepted.", "info");
                    scoreAndAdvance(word);
                }
            }
        });
    });

    // ================================================================
    // BUTTON: NEW DEAL
    // Returns all rack tiles to the bag and deals 7 fresh ones.
    // Only works when the board is empty.
    // ================================================================
    $("#deal-btn").on("click", function () {
        if (Object.keys(boardState).length > 0) {
            showMsg("Submit or restart before requesting a new deal.", "error");
            return;
        }

        if (tileBag.length === 0) {
            showMsg("The tile bag is empty — no new tiles available.", "info");
            return;
        }

        // Return current hand to the bag and reshuffle
        playerHand.forEach(function (t) {
            tileBag.push({ letter: t.letter, value: t.value });
        });
        shuffle(tileBag);
        playerHand = [];

        dealTiles();
        showMsg("New tiles dealt!", "info");
    });

    // ================================================================
    // BUTTON: RESTART
    // Resets all state and starts a completely new game.
    // ================================================================
    $("#restart-btn").on("click", function () {
        totalScore = 0;
        playerHand = [];
        boardState = {};
        tileUID    = 0;

        $("#total-score").text(0);
        $("#word-display").text("");
        $("#submit-btn, #deal-btn").prop("disabled", false);

        buildBag();
        buildBoard();
        dealTiles();
        showMsg("New game started — good luck!", "info");
    });

    // ================================================================
    // INITIALISE
    // ================================================================
    buildBag();
    buildBoard();
    dealTiles();

}); // end $(document).ready
