import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type CourseCheckboxProps = {
  courseName: string;
  courseAbbr: string;
  isSelected: boolean;
  onToggle: (courseName: string) => void;
};

export const CourseCheckbox = React.memo(
  ({ courseName, courseAbbr, isSelected, onToggle }: CourseCheckboxProps) => {
    return (
      <div className="flex items-center space-x-2">
        <Checkbox
          id={`check-${courseName}`}
          checked={isSelected}
          onCheckedChange={() => onToggle(courseName)}
        />
        <Label
          htmlFor={`check-${courseName}`}
          className="font-normal cursor-pointer"
        >
          {courseAbbr || courseName}
        </Label>
      </div>
    );
  },
);
