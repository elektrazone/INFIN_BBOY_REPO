import React, { useState, useEffect } from 'react';
import { highScoreService, HighScore } from '../../services/highScoreService';

const VIRTUAL_KEYBOARD = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G',
    'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S', 'T', 'U',
    'V', 'W', 'X', 'Y', 'Z', '0', '1', 
    '2', '3', '4', '5', '6', '7', '8', '9'
];
import '../../styles/highScore.css';

interface HighScoreOverlayProps {
    finalScore: number;
}

export const HighScoreOverlay: React.FC<HighScoreOverlayProps> = ({ finalScore }) => {
    const [scores, setScores] = useState<HighScore[]>([]);
    const [isQualifying, setIsQualifying] = useState(false);
    const [playerName, setPlayerName] = useState('');
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        const currentScores = highScoreService.getHighScores();
        setScores(currentScores);
        setIsQualifying(highScoreService.isHighScore(finalScore));
    }, [finalScore]);

    const handleSubmit = () => {
        if (playerName.trim() === '') return;

        highScoreService.saveScore(playerName.trim(), finalScore);
        
        // Refresh scores
        setScores(highScoreService.getHighScores());
        setSubmitted(true);
        setIsQualifying(false); // Hide the input form
    };

    const handleKeyPress = (key: string) => {
        setPlayerName(prev => {
            if (prev.length < 7) return prev + key;
            return prev;
        });
    };

    const handleDelete = () => {
        setPlayerName(prev => prev.slice(0, -1));
    };

    // Pad scores up to 8 slots
    const paddedScores = [...scores];
    while (paddedScores.length < 8) {
        paddedScores.push({ name: '', score: 0, timestamp: 0 });
    }

    const showKeyboard = isQualifying && !submitted;

    return (
        <div className="highscore-overlay-backdrop">
            {showKeyboard ? (
                /* --------------------------------- */
                /* MODE 1: DEDICATED NAME ENTRY PAGE */
                /* --------------------------------- */
                <div className="highscore-container" style={{ padding: '30px' }}>
                    <div className="highscore-title" style={{ fontSize: '24px', marginBottom: '10px' }}>
                        NEW HIGH SCORE!
                    </div>
                    <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
                        SCORE: <span style={{ color: '#ffd700' }}>{finalScore.toLocaleString()}</span>
                    </div>

                    <div className="hs-entry-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                        <div className="hs-entry-label">ENTER YOUR INITIALS</div>
                        
                        {/* Custom Read-Only Input display */}
                        <div className="hs-fake-input">
                            {playerName || <span className="hs-placeholder">YOUR NAME</span>}
                            <span className="hs-cursor">_</span>
                        </div>

                        {/* On-Screen Arcade Keyboard */}
                        <div className="hs-virtual-keyboard">
                            <div className="hs-vk-grid">
                                {VIRTUAL_KEYBOARD.map(char => (
                                    <button key={char} type="button" className="hs-vk-key" onClick={() => handleKeyPress(char)}>
                                        {char}
                                    </button>
                                ))}
                            </div>
                            <div className="hs-vk-actions">
                                <button type="button" className="hs-vk-btn hs-vk-del" onClick={handleDelete}>DEL</button>
                                <button type="button" className="hs-vk-btn hs-vk-save" onClick={handleSubmit}>SAVE</button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* --------------------------------- */
                /* MODE 2: THE LEADERBOARD ONLY      */
                /* --------------------------------- */
                <div className="highscore-container">
                    <div className="highscore-title">High Scores</div>

                    {/* Leaderboard */}
                    <div className="hs-list">
                        {paddedScores.map((scoreObj, index) => {
                            const isEmpty = scoreObj.score === 0;
                            const isJustSubmitted = submitted && scoreObj.name === playerName.trim() && scoreObj.score === finalScore;
                            
                            return (
                                <div key={index} className={`hs-row ${isJustSubmitted ? 'is-current' : ''}`}>
                                    <div className="hs-rank">{index + 1}.</div>
                                    <div className={`hs-name ${isEmpty ? 'hs-empty' : ''}`}>
                                        {isEmpty ? 'EMPTY' : scoreObj.name}
                                    </div>
                                    <div className="hs-score">
                                        {isEmpty ? '---' : scoreObj.score.toLocaleString()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
