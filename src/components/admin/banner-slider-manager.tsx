'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { ImageUploader } from '@/components/ui/image-uploader';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const MAX_SLIDES = 5;

interface BannerSliderManagerProps {
  readonly slides: string[];
  readonly onChange: (slides: string[]) => void;
}

interface SortableSlideProps {
  readonly url: string;
  readonly onRemove: () => void;
  readonly onReplace: (newUrl: string) => void;
}

function SortableSlide({ url, onRemove, onReplace }: Readonly<SortableSlideProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 z-10 p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-card/90 backdrop-blur-sm rounded-full shadow-elegant cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Reordenar imagen"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <ImageUploader
        value={url}
        onChange={(newUrl) => {
          if (!newUrl) onRemove();
          else onReplace(newUrl);
        }}
        label=""
        previewClassName="relative group rounded-lg overflow-hidden border aspect-video"
        isBannerImage
      />
    </div>
  );
}

export function BannerSliderManager({ slides, onChange }: Readonly<BannerSliderManagerProps>) {
  const { language } = useLanguage();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = slides.indexOf(String(active.id));
    const toIndex = slides.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    onChange(arrayMove(slides, fromIndex, toIndex));
  }

  function handleAddSlide(url: string) {
    if (!url || slides.length >= MAX_SLIDES) return;
    onChange([...slides, url]);
  }

  function handleRemoveSlide(url: string) {
    onChange(slides.filter((slide) => slide !== url));
  }

  function handleReplaceSlide(oldUrl: string, newUrl: string) {
    onChange(slides.map((slide) => (slide === oldUrl ? newUrl : slide)));
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slides} strategy={horizontalListSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {slides.map((url) => (
              <SortableSlide
                key={url}
                url={url}
                onRemove={() => handleRemoveSlide(url)}
                onReplace={(newUrl) => handleReplaceSlide(url, newUrl)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {slides.length < MAX_SLIDES ? (
        <ImageUploader
          value=""
          onChange={handleAddSlide}
          label=""
          previewClassName="relative group rounded-lg overflow-hidden border aspect-video"
          isBannerImage
        />
      ) : (
        <p className="text-xs text-muted-foreground">{t('bannerSliderMaxReached', language)}</p>
      )}
    </div>
  );
}
