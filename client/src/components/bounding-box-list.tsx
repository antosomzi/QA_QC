import { Card } from "@/components/ui/card";
import { AlertTriangle, Edit, Trash2, Triangle, Search } from "lucide-react";
import type { Annotation, BoundingBox } from "@shared/schema";
import { getLowConfidenceIssue } from "./helpers/video-player-helpers";
import { getSignTypeById } from "@/data/sign-types";
import { Button } from "./ui/button";
import EditAnnotationModal from "./edit-annotation-modal";
import React, { useState } from "react";

interface BoundingBoxListProps {
  annotation: Annotation | null;
  boundingBoxes: BoundingBox[];
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  onAnnotationDelete: (id: string) => void;
  onCheckSign?: () => void;
}

export default function BoundingBoxList({
  annotation,
  boundingBoxes,
  onAnnotationUpdate,
  onAnnotationDelete,
  onCheckSign,
}: BoundingBoxListProps) {
  if (!annotation) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">Select an annotation to view its bounding boxes</p>
      </div>
    );
  }
  const signType = annotation.signType ? getSignTypeById(annotation.signType) : null;
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Panel sign type with icon */}
        <Card className="p-2 bg-card border-border">
          <div className="flex items-center justify-between gap-4">
            {/* Sign type */}
            <div className="flex items-center gap-4">
              {signType && (
                <img
                  src={signType.imagePath}
                  alt={signType.name}
                  className="w-16 h-16 object-contain flex-shrink-0"
                  loading="lazy"
                />
              )}
              <div>
                <p className="text-2xl font-bold text-foreground">{annotation.signType}</p>
              </div>
            </div>
          
            {/* Low confidence alert */}
            {(() => {
              const lowConfidence = getLowConfidenceIssue(annotation);
              if (!lowConfidence.isLowConfidence) return null;

              let title = "Low confidence";
              if (lowConfidence.lowClassification && lowConfidence.lowDetection) {
                title = "Low confidence: detection & classification";
              } else if (lowConfidence.lowClassification) {
                title = "Low confidence: classification";
              } else if (lowConfidence.lowDetection) {
                title = "Low confidence: detection";
              }

              return (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-red-800">{title}</p>
                    <p className="text-red-500 text-xs mt-1">
                      {lowConfidence.lowClassification && `Classification: ${(annotation.classificationConfidence! * 100).toFixed(0)}%`}
                      {lowConfidence.lowClassification && lowConfidence.lowDetection && ` • `}
                      {lowConfidence.lowDetection && `Detection: ${(annotation.detectionConfidence! * 100).toFixed(0)}%`}
                    </p>
                  </div>
                </div>
              );
            })()}

          <div className="flex items-center space-x-1">
            {/* Bouton Edit */}
            <Button
              variant="ghost"
              // Ajout de [&_svg]:size-8 pour forcer la taille du SVG interne à 32px
              className="p-1 w-12 h-12 flex items-center justify-center text-muted-foreground hover:text-foreground [&_svg]:size-6"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsModalOpen(true);
              }}
              data-testid={`button-edit-annotation-${annotation.id}`}
            >
              {/* Vous pouvez garder le className ici par précaution, ou utiliser size={32} */}
              <Edit className="w-6 h-6" />
            </Button>

            {/* Bouton Delete */}
            <Button
              variant="ghost"
              // Suppression de size="sm" et ajout de w-12 h-12 pour harmoniser la taille du bouton
              // Ajout de [&_svg]:size-6 pour forcer la taille du SVG interne à 24px
              className="p-1 w-12 h-12 flex items-center justify-center text-muted-foreground hover:text-destructive [&_svg]:size-6"
              onClick={(e) => {
                e.stopPropagation();
                onAnnotationDelete(annotation.id);
              }}
              data-testid={`button-delete-annotation-${annotation.id}`}
            >
              <Trash2 className="w-6 h-6" />
            </Button>
          </div>

          </div>
        </Card>

        {/* Check Sign Button */}
        <Button
          className="w-full h-10 text-lg font-semibold bg-green-600 hover:bg-green-700 text-white"
          onClick={() => onCheckSign?.()}
        >
          <Search className="w-6 h-6 mr-2" />
          Check Sign
        </Button>
      </div>
           {/* Edit modal rendered outside the list to avoid event bubbling issues */}
            {isModalOpen && (
              <EditAnnotationModal
                annotation={annotation}
                onSave={(updates) => {
                  onAnnotationUpdate(annotation.id, updates);
                  setIsModalOpen(false);
                }}
                onClose={() => setIsModalOpen(false)}
              />
            )}
    </div>
  );
}
