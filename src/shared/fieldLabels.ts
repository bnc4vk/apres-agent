export const FIELD_LABELS: Record<string, string> = {
  dates: "Dates",
  group_size: "Group size",
  skill_levels: "Skill levels",
  gear_rental: "Gear rentals",
  budget: "Budget",
  passes: "Pass ownership",
  travel_restrictions: "Travel restrictions",
  location_input: "Location preference",
  traveler_pods: "Departure locations",
  lodging_constraints: "Lodging constraints",
  dining_constraints: "Dining constraints"
};

export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
