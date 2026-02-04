import { useState } from 'react';
import { Plus, GripVertical, Copy, Trash2, PlusCircle } from 'lucide-react';
import { useAlbum, type Page } from '../../contexts/AlbumContext';
import { cn } from '../../lib/utils';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortablePageProps {
    page: Page;
    index: number;
    isSelected: boolean;
    isSpreadView: boolean;
    spread: Page[];
    onPageSelect: (index: number) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onInsert: (index: number) => void;
}

const dropAnimationConfig = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.4',
            },
        },
    }),
};

function SortablePageThumbnail({ page, index, isSelected, isSpreadView, spread, onPageSelect, onDuplicate, onDelete, onInsert }: SortablePageProps) {
    const isCover = page.layoutTemplate === 'cover-front' || page.layoutTemplate === 'cover-back';
    const { album } = useAlbum();

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: page.id,
        disabled: isCover || album?.config.isLocked
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.3 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex flex-col gap-1 items-center group relative"
        >
            <div
                className={cn(
                    "flex items-center transition-all",
                    isSpreadView && spread.length > 1 ? "gap-0.5" : ""
                )}
            >
                {spread.map((spreadPage, idx) => (
                    <div
                        key={spreadPage.id}
                        onClick={(e) => {
                            e.stopPropagation();
                            onPageSelect(index + idx);
                        }}
                        className={cn(
                            "relative flex-shrink-0 w-24 h-14 bg-white border-2 cursor-pointer transition-all duration-300 overflow-hidden",
                            isSelected
                                ? "border-catalog-accent shadow-xl shadow-catalog-accent/20 z-10 scale-105"
                                : "border-black/5 hover:border-catalog-accent/40 hover:scale-105",
                            isSpreadView && spread.length > 1 && idx === 0 && "rounded-l-xl",
                            isSpreadView && spread.length > 1 && idx === 1 && "rounded-r-xl",
                            (!isSpreadView || spread.length === 1) && "rounded-xl"
                        )}
                        style={{ backgroundColor: spreadPage.backgroundColor }}
                    >
                        {/* Page Preview if background exists */}
                        {spreadPage.backgroundImage && (
                            <img src={spreadPage.backgroundImage} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="" />
                        )}

                        {/* Page Number */}
                        <div className="absolute bottom-1.5 left-2 text-[8px] font-black text-catalog-text/40 font-outfit uppercase tracking-tighter z-10">
                            {spreadPage.pageNumber}
                        </div>

                        {/* Drag Handle Indicator */}
                        {!isCover && !album?.config.isLocked && idx === 0 && (
                            <div
                                {...attributes}
                                {...listeners}
                                className="absolute top-1 right-1 p-1 bg-white/80 backdrop-blur-md rounded-md opacity-0 group-hover:opacity-100 transition-all cursor-grab active:cursor-grabbing hover:bg-catalog-accent hover:text-white z-20 shadow-sm"
                            >
                                <GripVertical className="w-2.5 h-2.5" />
                            </div>
                        )}

                        {/* Quick Actions (On Hover) */}
                        {!album?.config.isLocked && (
                            <div className="absolute inset-0 bg-catalog-accent/10 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1.5 backdrop-blur-[1px] z-10">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDuplicate(spreadPage.id); }}
                                    className="p-1 px-1.5 bg-white text-catalog-accent rounded-md shadow-lg hover:bg-catalog-accent hover:text-white transition-all scale-75 hover:scale-100"
                                    title="Duplicate Page"
                                >
                                    <Copy className="w-2.5 h-2.5" />
                                </button>
                                {!isCover && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(spreadPage.id); }}
                                        className="p-1 px-1.5 bg-white text-red-500 rounded-md shadow-lg hover:bg-red-500 hover:text-white transition-all scale-75 hover:scale-100"
                                        title="Delete Page"
                                    >
                                        <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onInsert(index + idx); }}
                                    className="p-1 px-1.5 bg-white text-catalog-accent rounded-md shadow-lg hover:bg-catalog-accent hover:text-white transition-all scale-75 hover:scale-100"
                                    title="Insert Blank After"
                                >
                                    <PlusCircle className="w-2.5 h-2.5" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <span className={cn(
                "text-[7px] font-black uppercase tracking-[0.2em] font-outfit transition-all",
                isSelected ? "text-catalog-accent" : "text-catalog-text/30"
            )}>
                {isSpreadView && spread.length > 1
                    ? `Spread ${Math.floor(index / 2) + 1}`
                    : index === 0 ? 'Front' : index === (album?.pages.length || 0) - 1 ? 'Back' : page.pageNumber}
            </span>
        </div>
    );
}

export function Filmstrip() {
    const {
        album,
        currentPageIndex,
        setCurrentPageIndex,
        addPage,
        removePage,
        duplicatePage,
        getSpread,
        reorderPages
    } = useAlbum();

    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    if (!album) return null;

    const handleDragStart = (event: any) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = album.pages.findIndex((p) => p.id === active.id);
            const newIndex = album.pages.findIndex((p) => p.id === over.id);

            reorderPages(oldIndex, newIndex);
        }
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 h-28 glass rounded-[2.5rem] border border-white/40 shadow-2xl flex items-center px-8 gap-10 z-[100] max-w-[90vw]">
            {/* Page Thumbnails */}
            <div className="flex-1 flex items-center gap-6 overflow-x-auto py-5 px-4 no-scrollbar">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={album.pages.map(p => p.id)}
                        strategy={horizontalListSortingStrategy}
                    >
                        {album.pages.map((page, index) => {
                            const isSpreadView = album.config.useSpreadView;
                            const spread = getSpread(index);
                            const isFirstInSpread = spread[0].id === page.id;
                            const isSelected = spread.some(p => album.pages[currentPageIndex]?.id === p.id);

                            if (isSpreadView && !isFirstInSpread) return null;

                            return (
                                <SortablePageThumbnail
                                    key={page.id}
                                    page={page}
                                    index={index}
                                    isSelected={isSelected}
                                    isSpreadView={isSpreadView}
                                    spread={spread}
                                    onPageSelect={(idx: number) => setCurrentPageIndex(idx)}
                                    onDuplicate={(id) => duplicatePage(id)}
                                    onDelete={(id) => {
                                        if (confirm('Are you sure you want to delete this page?')) {
                                            removePage(id);
                                        }
                                    }}
                                    onInsert={(idx) => addPage(undefined, idx + 1)}
                                />
                            );
                        })}
                    </SortableContext>

                    <DragOverlay dropAnimation={dropAnimationConfig}>
                        {activeId ? (
                            <div className="w-24 h-14 bg-white border-2 border-catalog-accent rounded-xl shadow-2xl scale-110 opacity-80" />
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>

            {/* Add Page Button */}
            <div className="flex shrink-0">
                <button
                    disabled={album.config.isLocked}
                    onClick={() => addPage()}
                    className={cn(
                        "w-14 h-14 glass rounded-2xl flex flex-col items-center justify-center gap-1 text-catalog-accent border border-white/40 shadow-lg hover:scale-110 active:scale-95 transition-all group",
                        album.config.isLocked && "opacity-50 cursor-not-allowed grayscale"
                    )}
                >
                    <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                </button>
            </div>
        </div>
    );
}

