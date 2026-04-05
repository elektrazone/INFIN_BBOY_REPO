// src/services/highScoreService.ts

export interface HighScore {
    name: string;
    score: number;
    timestamp: number;
}

const STORAGE_KEY = 'infin_bboy_highscores';
const MAX_SCORES = 8;

export const highScoreService = {
    /**
     * Get the current top scores
     */
    getHighScores(): HighScore[] {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const scores: HighScore[] = JSON.parse(data);
                // Ensure they are sorted and limited
                return scores
                    .sort((a, b) => b.score - a.score)
                    .slice(0, MAX_SCORES);
            }
        } catch (e) {
            console.error("Error loading high scores:", e);
        }
        
        // Return 8 empty placeholders if no data exists yet
        const emptyScores: HighScore[] = [];
        return emptyScores;
    },

    /**
     * Check if a score is high enough to make it to the top list
     */
    isHighScore(score: number): boolean {
        if (score <= 0) return false;
        
        const currentScores = this.getHighScores();
        
        // If we have fewer than MAX_SCORES, then any positive score is a high score
        if (currentScores.length < MAX_SCORES) {
            return true;
        }

        // Check if the score is greater than the lowest score in the list
        const lowestScore = currentScores[currentScores.length - 1].score;
        return score > lowestScore;
    },

    /**
     * Save a new score. Only keeps the top 8.
     */
    saveScore(name: string, score: number): void {
        const currentScores = this.getHighScores();
        
        const newScore: HighScore = {
            name: name || 'ANON',
            score,
            timestamp: Date.now()
        };

        const updatedScores = [...currentScores, newScore]
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_SCORES);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedScores));
            console.log("High score saved successfully!");
        } catch (e) {
            console.error("Error saving high score:", e);
        }
    },

    /**
     * Admin tool: Clear all high scores
     */
    clearAllScores(): void {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log("All high scores wiped!");
        } catch (e) {
            console.error("Error clearing high scores:", e);
        }
    },

    /**
     * Admin tool: Delete a specific player's score matching exactly their name
     */
    deleteScore(playerName: string): void {
        const currentScores = this.getHighScores();
        const upperNameToMatch = playerName.trim().toUpperCase();

        // Keep all scores EXCEPT the exact name matched
        const newScores = currentScores.filter(s => s.name !== upperNameToMatch);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newScores));
            console.log(`Deleted player ${upperNameToMatch} from high scores.`);
        } catch (e) {
            console.error("Error deleting high score:", e);
        }
    }
};
