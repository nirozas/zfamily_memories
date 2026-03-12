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
            className="flex flex-col gap-1 items-center relative"
        >
            <div
                className={cn(
                    "flex items-center transition-all",
                    isSpreadView && spread.length > 1 ? "gap-0.5" : ""
                )}
            >
                {spread.map((spreadPage, idx) => (
                    <div key={spreadPage.id} className="group/thumb relative flex flex-col items-center">
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                onPageSelect(index + idx);
                            }}
                            className={cn(
                                "relative flex-shrink-0 w-32 h-[70px] bg-white border border-black/10 cursor-pointer transition-all duration-300 overflow-hidden",
                                isSelected
                                    ? "border-catalog-accent shadow-xl shadow-catalog-accent/20 z-10 scale-105"
                                    : "border-black/5 hover:border-catalog-accent/40 hover:scale-105",
                                isSpreadView && spread.length > 1 && idx === 0 && "rounded-l-lg",
                                isSpreadView && spread.length > 1 && idx === 1 && "rounded-r-lg",
                                (!isSpreadView || spread.length === 1) && "rounded-lg"
                            )}
                            style={{ backgroundColor: spreadPage.backgroundColor }}
                        >
                            {/* Page Preview if background exists */}
                            {spreadPage.backgroundImage && (
                                <img src={spreadPage.backgroundImage} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="" />
                            )}

                            {/* Page Number */}
                            <div className="absolute bottom-2 left-3 text-[12px] font-black text-catalog-text/40 font-outfit uppercase tracking-tighter z-10">
                                {spreadPage.pageNumber}
                            </div>

                            {/* Drag Handle Indicator */}
                            {!isCover && !album?.config.isLocked && idx === 0 && (
                                <div
                                    {...attributes}
                                    {...listeners}
                                    className="absolute top-1 right-1 p-1 bg-white/80 backdrop-blur-md rounded opacity-0 group-hover/thumb:opacity-100 transition-all cursor-grab active:cursor-grabbing hover:bg-catalog-accent hover:text-white z-20 shadow-sm"
                                >
                                    <GripVertical className="w-5 h-5" />
                                </div>
                            )}
                        </div>

                        {/* Quick Actions (Always Visible) Placed under the page */}
                        {!album?.config.isLocked && (
                            <div className="mt-1 flex items-center justify-center gap-1 w-fit pointer-events-auto">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDuplicate(spreadPage.id); }}
                                    className="p-1 bg-black/5 text-catalog-text/50 rounded-md hover:bg-catalog-accent hover:text-white transition-all"
                                    title="Duplicate Page"
                                >
                                    <Copy className="w-2.5 h-2.5" />
                                </button>
                                {!isCover && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(spreadPage.id); }}
                                        className="p-1 bg-black/5 text-catalog-text/50 rounded-md hover:bg-red-500 hover:text-white transition-all"
                                        title="Delete Page"
                                    >
                                        <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onInsert(index + idx); }}
                                    className="p-1 bg-black/5 text-catalog-text/50 rounded-md hover:bg-catalog-accent hover:text-white transition-all"
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
                "text-[10px] font-black uppercase tracking-[0.2em] font-outfit transition-all max-w-[120px] truncate text-center",
                isSelected ? "text-catalog-accent" : "text-catalog-text/30"
            )}>
                {isSpreadView && spread.length > 1
                    ? `Spread ${Math.floor(index / 2) + 1}`
                    : index === 0 ? 'Front' : index === (album?.pages.length || 0) - 1 ? 'Back' : `Page ${page.pageNumber}`}
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
        <div className="w-full h-auto py-1 bg-white/70 backdrop-blur-xl border-t border-black/5 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] flex flex-col justify-center px-4 md:px-8 gap-1 z-[40]">
            {/* Page Thumbnails */}
            <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden py-1.5 px-2 pb-2.5 w-full styling-scrollbar-thin">
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
                            <div className="w-40 h-[88px] bg-white border-2 border-catalog-accent rounded-lg shadow-2xl scale-110 opacity-80" />
                        ) : null}
                    </DragOverlay>
                </DndContext>

                {/* Add Page Button */}
                <div className="flex shrink-0 self-start mt-0.5">
                    <button
                        disabled={album.config.isLocked}
                        onClick={() => addPage()}
                        className={cn(
                            "w-40 h-[88px] glass rounded-xl flex items-center justify-center text-catalog-accent border border-white/40 shadow-sm hover:scale-105 active:scale-95 transition-all group bg-white/50",
                            album.config.isLocked && "opacity-50 cursor-not-allowed grayscale"
                        )}
                        title="Add New Page"
                    >
                        <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
}
