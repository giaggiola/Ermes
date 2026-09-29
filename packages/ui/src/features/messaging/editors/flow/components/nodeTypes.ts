import { TriggerNode } from "./TriggerNode";
import { EmailNode } from "./EmailNode";
import { DelayNode } from "./DelayNode";
import { ConditionNode } from "./ConditionNode";
import { DiscountNode } from "./DiscountNode";
import { EndNode } from "./EndNode";

export const nodeTypes = {
  trigger: TriggerNode,
  email: EmailNode,
  delay: DelayNode,
  condition: ConditionNode,
  discount: DiscountNode,
  end: EndNode,
};

export {
  TriggerNode,
  EmailNode,
  DelayNode,
  ConditionNode,
  DiscountNode,
  EndNode,
};
