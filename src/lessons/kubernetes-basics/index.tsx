import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'In Kubernetes you declare the state you want, and controllers keep observing, diffing and acting until the cluster matches it.',
    what: 'A Deployment says how many replicas of a pod template you want. It manages ReplicaSets, and a ReplicaSet\'s controller counts the pods that match its selector and creates or deletes pods to close the gap: observe, diff, act, forever. A new pod starts Pending until the scheduler binds it to a node with enough unreserved CPU, then its container is created and, once it is Ready, a Service (a stable name that selects pods by label) sends traffic to it. Changing the image creates a new ReplicaSet and moves pods over in a rolling update, bounded by maxSurge and maxUnavailable. When a node dies the control plane waits, marks it NotReady, and later evicts its pods so replacements start elsewhere.',
    analogy: 'A thermostat for your fleet. You set the target (three pods), and the loop keeps comparing the room with the target and running the heating or cooling until they match, whatever knocked it off.',
    useCases: [
      'Running a web service as three identical pods that survive a pod or node crash without anyone paging a human',
      'Shipping a new image with a rolling update that never drops below a set number of Ready pods',
      'Reading a stuck deploy: a pod Pending with "Insufficient cpu", or a Service with no endpoints',
      'Pulling one misbehaving pod out of traffic with a label change so you can inspect it alive',
    ],
    why: 'Almost every service at this tier runs on Kubernetes or something modelled on it, and its failures are understood through the control loop: what the controller sees, what it wants and who acts. It builds on `containers` (what a pod runs), `load-balancing` (what a Service does for you) and `infrastructure-as-code` (the same declare-then-reconcile idea). Probes, rollout strategies, Ingress, Helm, RBAC and operators are out of scope here: Ingress routes outside traffic to Services, and the rest are separate topics.',
    watch: 'The grid is the three nodes, each with four pod slots. A solid green cell is a Ready pod; a yellow cell is Pending, creating or running but not yet Ready (a tint is creating, an outline is running not Ready); a dim cell is Terminating; a red cell on a dark column is a pod on a node that has stopped reporting; a faint dashed cell is a free slot. Its text is the image tag. A violet ring is a pod of the old ReplicaSet and a sky ring a pod of the new one, during a rollout; an amber ring is the pod you selected; a dim ring is a pod the Service does not select. Blue pills are requests from the Service to a pod (red ones failed). In the reconcile strip the yellow box is the action the loop is taking this tick. The cards on top are the Deployment and its ReplicaSets with their current-of-wanted counts.',
  },
  tryThis: [
    'Click a Ready pod in the grid, press Delete selected pod, and read the strip: the ReplicaSet observes two pods, wants three, and creates one.',
    'Drag Replicas up to 5 and follow a new pod from Pending to Ready: the Deployment sets the number, the ReplicaSet creates the pods and the scheduler places them.',
    'Press Change image to v2 and watch the rings: it never has more than one extra pod, and (with 3 replicas) never fewer than 3 Ready.',
    'Press Crash node-2 and watch the requests: pods on the silent node keep receiving traffic until the control plane marks the node NotReady, then they are replaced elsewhere.',
    'Press Over-request CPU: the new pod stays Pending with the scheduler\'s reason, because no node has that much CPU.',
  ],
  keyIdeas: [
    'Controllers reconcile: observe the actual state, diff it against the desired state, act to close the gap, and repeat.',
    'Scaling or deleting changes numbers and objects; the ReplicaSet\'s controller does the creating, the scheduler does the placing.',
    'A Service sends traffic only to Ready pods whose labels match its selector, so a label change removes a pod from traffic without killing it.',
    'A rolling update stays inside maxSurge extra pods and maxUnavailable missing ones, and a pod is Pending until some node has room.',
  ],
  quiz: [
    {
      q: 'You change a Deployment from 3 replicas to 5. What creates the two new pods?',
      options: [
        'The ReplicaSet controller, once it sees 3 pods but wants 5',
        'The command itself, which starts two containers directly on nodes',
        'The scheduler, which makes pods on whichever node is idle',
        'The nodes, which pull two more pods when they have room',
      ],
      answer: 0,
      why: 'Changing replicas only edits desired state. The ReplicaSet controller compares matching pods with the wanted count and creates the difference; the scheduler then places them and the kubelets start them.',
    },
    {
      q: 'You delete one pod of a 3-replica Deployment. What happens next?',
      options: [
        'The ReplicaSet sees two pods, wants three, and creates a new one',
        'Nothing, because the Deployment now runs with two replicas',
        'The Deployment is marked failed until someone recreates it',
        'The Service keeps routing to the deleted pod until a restart',
      ],
      answer: 0,
      why: 'Deleting a pod is not changing what you want. The desired count is still three, so the loop notices the gap and fills it; the Service drops the pod from its endpoints as soon as it stops being Ready.',
    },
    {
      q: 'A Deployment has 8 replicas and the default 25% for maxSurge and maxUnavailable. During a rolling update, how many pods can exist and how many must stay Ready?',
      options: [
        'Up to 10 pods, and at least 6 stay Ready',
        'Up to 8 pods, and at least 8 stay Ready',
        'Up to 10 pods, and at least 8 stay Ready',
        'Up to 16 pods, and at least 6 stay Ready',
      ],
      answer: 0,
      why: 'maxSurge rounds up: 25% of 8 is 2 extra pods, so 10 at most. maxUnavailable rounds down: 25% of 8 is 2, so 8 - 2 = 6 must stay Ready.',
    },
    {
      q: 'A new pod stays Pending with "0/3 nodes are available: 3 Insufficient cpu". What is wrong?',
      options: [
        'No node has enough unreserved CPU for its request',
        'The container inside it is using too much CPU',
        'The nodes are overloaded and are throttling the pod',
        'The Service has no endpoints for it to join yet',
      ],
      answer: 0,
      why: 'The scheduler counts the CPU that pods request, not what they use. A pod is bound only to a node where its request still fits, so with none free it waits, unscheduled.',
    },
    {
      q: 'How does a Service decide which pods get its traffic?',
      options: [
        'Its label selector matches pod labels, and the pod must be Ready',
        'It keeps a list of pod names that you maintain by hand, one by one',
        'It follows the Deployment that created each of the pods',
        'It picks a node first and then any pod running on it',
      ],
      answer: 0,
      why: 'A Service selects by labels, not by owner or node. Change a pod\'s label and it falls out of the endpoints while it keeps running; a pod that isn\'t Ready is left out too.',
    },
  ],
};

export default lesson;
