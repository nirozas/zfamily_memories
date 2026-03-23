import React, { useState, useMemo } from 'react';
import { X, Folder, ChevronRight, ChevronDown, FolderPlus, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FolderPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (folderPath: string) => void;
    currentFolder?: string;
    existingFolders: string[];
    title?: string;
}

interface TreeNode {
    name: string;
    path: string;
    children: Record<string, TreeNode>;
}

export function FolderPickerModal({
    isOpen,
    onClose,
    onSelect,
    currentFolder = '/',
    existingFolders,
    title = 'Select Destination Folder'
}: FolderPickerModalProps) {
    const [selectedPath, setSelectedPath] = useState(currentFolder);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['/']));
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Build tree
    const tree = useMemo(() => {
        const root: TreeNode = { name: 'Vault (Root)', path: '/', children: {} };

        existingFolders.forEach(folderPath => {
            if (!folderPath || folderPath === '/') return;
            
            const parts = folderPath.split('/').filter(Boolean);
            let currentNode = root;
            let currentPath = '';

            parts.forEach((part) => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                if (!currentNode.children[part]) {
                    currentNode.children[part] = {
                        name: part,
                        path: currentPath,
                        children: {}
                    };
                }
                currentNode = currentNode.children[part];
            });
        });

        return root;
    }, [existingFolders]);

    if (!isOpen) return null;

    const toggleExpand = (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const handleSelectNode = (path: string) => {
        setSelectedPath(path);
        setIsCreatingNew(false);
    };

    const handleConfirm = () => {
        if (isCreatingNew && newFolderName.trim()) {
            // Append new folder to the selected path
            const base = selectedPath === '/' ? '' : selectedPath;
            onSelect(`${base}/${newFolderName.trim()}`.replace(/^\//, ''));
        } else {
            onSelect(selectedPath);
        }
    };

    const renderNode = (node: TreeNode, level = 0) => {
        const isExpanded = expandedPaths.has(node.path);
        const isSelected = selectedPath === node.path;
        const hasChildren = Object.keys(node.children).length > 0;

        return (
            <div key={node.path} className="select-none">
                <div 
                    onClick={() => handleSelectNode(node.path)}
                    className={cn(
                        "flex items-center gap-2 py-2 px-3 hover:bg-black/5 rounded-lg cursor-pointer transition-colors",
                        isSelected && "bg-catalog-accent/10 text-catalog-accent"
                    )}
                    style={{ paddingLeft: `${level * 16 + 12}px` }}
                >
                    {hasChildren ? (
                        <button onClick={(e) => toggleExpand(node.path, e)} className="p-0.5 hover:bg-black/10 rounded">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </button>
                    ) : (
                        <div className="w-5" /> // spacer
                    )}
                    <Folder className={cn("w-5 h-5", isSelected ? "text-catalog-accent" : "text-gray-400")} />
                    <span className="text-sm font-medium">{node.name}</span>
                    
                    {isSelected && (
                        <Check className="w-4 h-4 ml-auto" />
                    )}
                </div>

                {isExpanded && hasChildren && (
                    <div className="relative">
                        <div className="absolute left-6 top-0 bottom-0 border-l border-gray-200" style={{ left: `${level * 16 + 22}px` }} />
                        {Object.values(node.children)
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(child => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Folder className="w-5 h-5 text-catalog-accent" />
                        {title}
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white">
                    {renderNode(tree)}
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-4">
                    {!isCreatingNew ? (
                        <button
                            onClick={() => setIsCreatingNew(true)}
                            className="flex items-center gap-2 text-sm text-catalog-accent font-semibold hover:text-catalog-accent/80 transition-colors px-2"
                        >
                            <FolderPlus className="w-4 h-4" />
                            Create new folder inside "{selectedPath === '/' ? 'Vault' : selectedPath.split('/').pop()}"
                        </button>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
                                New Folder inside "{selectedPath === '/' ? 'Vault' : selectedPath.split('/').pop()}"
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Folder name..."
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleConfirm();
                                        if (e.key === 'Escape') setIsCreatingNew(false);
                                    }}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-catalog-accent/50 focus:border-catalog-accent"
                                />
                                <button
                                    onClick={() => setIsCreatingNew(false)}
                                    className="px-3 py-2 text-gray-500 hover:bg-gray-200 rounded-lg text-sm font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleConfirm}
                        className="w-full py-3 bg-catalog-accent text-white rounded-lg font-bold hover:bg-catalog-accent/90 transition-colors shadow-sm"
                    >
                        Select Destination
                    </button>
                </div>
            </div>
        </div>
    );
}
