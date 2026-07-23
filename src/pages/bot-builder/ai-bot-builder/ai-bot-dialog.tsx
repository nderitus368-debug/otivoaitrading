import React, { useState } from 'react';
import { generateBotXML } from '@/external/bot-skeleton/services/ai-builder';
import { botNotification } from '@/components/bot-notification/bot-notification';

interface AIBotDialogProps {
    onClose: () => void;
}

const AIBotDialog = ({ onClose }: AIBotDialogProps) => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsLoading(true);
        try {
            const xmlString = await generateBotXML(prompt);
            
            if (xmlString) {
                const workspace = window.Blockly?.derivWorkspace;
                if (workspace) {
                    workspace.clear();
                    const dom = window.Blockly.utils.xml.textToDom(xmlString);
                    window.Blockly.Xml.domToWorkspace(dom, workspace);
                    botNotification('Bot generated successfully!');
                    onClose();
                } else {
                    botNotification('Error: Workspace not found.');
                }
            } else {
                 botNotification('Error: Failed to generate bot from prompt.');
            }
        } catch (error) {
            console.error(error);
            botNotification('Error: An error occurred during generation.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="ai-bot-dialog">
            <div className="ai-bot-dialog-header">
                <h3>Build Bot with AI</h3>
                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
            <div className="ai-bot-dialog-body">
                <p>Describe the trading bot you want to create:</p>
                <form onSubmit={handleSubmit}>
                    <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g. Create a bot using Martingale with a $10 stake..."
                        rows={4}
                        disabled={isLoading}
                    />
                    <div className="ai-bot-dialog-footer">
                        <button type="submit" disabled={isLoading || !prompt.trim()}>
                            {isLoading ? 'Generating...' : 'Generate Bot'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AIBotDialog;
