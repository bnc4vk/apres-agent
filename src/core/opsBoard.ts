import dayjs from "dayjs";
import { TripSpec } from "./tripSpec";

export type OpsTask = {
  id: string;
  title: string;
  owner: string;
  dueDate: string | null;
  status: "todo" | "blocked" | "done";
  notes: string;
};

export type OpsBoard = {
  tasks: OpsTask[];
  chatBootstrap: {
    enabled: boolean;
    inviteUrl: string | null;
    provider: "twilio" | "none";
  };
  splitwiseBootstrap: {
    enabled: boolean;
    groupId: string | null;
    status: "pending" | "ready";
  };
};

export function buildOpsBoard(spec: TripSpec): OpsBoard {
  const start = spec.dates.start ? dayjs(spec.dates.start) : null;
  const tasks: OpsTask[] = [
    {
      id: "booking-deposit",
      title: "Confirm lodging and pay deposit",
      owner: "Organizer",
      dueDate: start ? start.subtract(28, "day").format("YYYY-MM-DD") : null,
      status: "todo",
      notes: "Lock the top itinerary option before payment."
    },
    {
      id: "car-rental",
      title: "Finalize rental car plan",
      owner: "Travel lead",
      dueDate: start ? start.subtract(21, "day").format("YYYY-MM-DD") : null,
      status: "todo",
      notes: spec.travel.noFlying ? "Driving-only trip; assign carpool drivers." : "Reserve AWD options for airport arrivals."
    },
    {
      id: "gear-rental",
      title: "Reserve gear rentals",
      owner: "Gear lead",
      dueDate: start ? start.subtract(14, "day").format("YYYY-MM-DD") : null,
      status: "todo",
      notes: "Align pickup with arrival window."
    },
    {
      id: "grocery-run",
      title: "Assign grocery run and shopping list",
      owner: "Food lead",
      dueDate: start ? start.subtract(2, "day").format("YYYY-MM-DD") : null,
      status: "todo",
      notes: "Prioritize first-night dinner and breakfasts."
    },
    {
      id: "restaurant-booking",
      title: "Book takeout / dinner for large group",
      owner: "Food lead",
      dueDate: start ? start.subtract(7, "day").format("YYYY-MM-DD") : null,
      status: "todo",
      notes: "Check reservable and large-party policies."
    }
  ];

  return {
    tasks,
    chatBootstrap: {
      enabled: spec.organizerOps.wantsGroupChatSetup === true,
      inviteUrl: null,
      provider: spec.organizerOps.wantsGroupChatSetup ? "twilio" : "none"
    },
    splitwiseBootstrap: {
      enabled: spec.organizerOps.wantsSplitwiseSetup === true,
      groupId: null,
      status: spec.organizerOps.wantsSplitwiseSetup ? "pending" : "ready"
    }
  };
}
