
import { useState, useEffect } from 'react';

import { Dialog, DialogContent } from '../ui/Dialog';
import { RichTextEditor } from './RichTextEditor';
import { Button } from '../ui/Button';


interface TextEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialContent: string;
    onSave: (content: string) => void;
}

export function TextEditorModal({ isOpen, onClose, initialContent, onSave }: TextEditorModalProps) {
    const [content, setContent] = useState(initialContent);

    // Sync content when modal opens
    useEffect(() => {
        if (isOpen) setContent(initialContent);
    }, [isOpen, initialContent]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-6 bg-slate-50">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-serif font-bold text-catalog-text">Professional Text Editor</h2>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => { onSave(content); onClose(); }} className="bg-catalog-accent text-white hover:bg-catalog-accent/90">
                            Save Changes
                        </Button>
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden p-8 flex flex-col">
                    {/* Toolbar is built-in to RichTextEditor, but we could add a dedicated top bar here if needed */}
                    <div className="flex-1 overflow-auto">
                        <RichTextEditor
                            content={content}
                            onChange={setContent}
                            className="w-full h-full text-lg outline-none max-w-2xl mx-auto"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="mt-4 text-xs text-slate-400 text-center">
                    Tip: Select text to see formatting options. Use Ctrl+B, Ctrl+I for shortcuts.
                </div>
            </DialogContent>
        </Dialog>
    );
}

