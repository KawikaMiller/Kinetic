import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A container packages an app with everything it needs and runs it as an isolated process on a shared OS kernel. It's lighter and faster to start than a virtual machine.",
    what: "A VM emulates a whole computer and boots its own guest OS on a hypervisor. A container is just a normal process that the Linux kernel isolates: namespaces give it its own view of processes, network and filesystem, and cgroups limit its CPU and memory. Its filesystem comes from an image built in cached, read-only layers, so the same image runs identically on a laptop, in CI and in production.",
    analogy: "VMs are separate houses, each with its own plumbing and foundations. Containers are flats in one building: shared foundations (the kernel), but locked front doors and their own metered utilities.",
    useCases: [
      "Docker images as the unit of deployment in CI/CD pipelines",
      "Kubernetes scheduling containers across a cluster",
      "Running dependencies (Postgres, Redis) locally with one command",
      "Ending \"works on my machine\" by shipping the environment with the code",
    ],
    why: "Most modern backend services are built, shipped and run as containers. Mid-level engineers are expected to write sensible Dockerfiles, understand why builds are slow or fast, and debug containers that get OOM-killed or can't reach each other.",
    watch: "In VMs vs containers, red blocks are the guest OS each VM must carry (over a dashed red hypervisor), blue is the host kernel the containers share, violet is each app with its libraries, and grey is the hardware; the VM side's heading is red and the container side's green, the costly and the cheap. The green bars race to show boot time, not to scale. In Image layers, the yellow row is the instruction running now, and each layer is green when reused from cache and red when rebuilt. In Isolation, each blue-outlined box is one container's own view; the PID flips between the container's view and the host's, the meters are green and turn red near the cgroup limit, and a killed container's box turns red.",
  },
  tryThis: [
    'Slide Apps up to 4 and hit Boot: every VM drags a whole OS along.',
    'In Image layers, build once, then "Edit source code" with each Dockerfile order.',
    'Edit package.json: see why dependency changes always pay for npm ci.',
    'In Isolation, flip the process view to the host, then leak memory in worker.',
  ],
  keyIdeas: [
    'Containers share the host kernel; VMs each boot their own OS.',
    'Namespaces isolate what a container can see; cgroups limit what it can use.',
    'Image layers are cached: one changed layer rebuilds everything above it.',
    'Put rarely-changing steps (dependencies) before often-changing ones (source).',
  ],
  quiz: [
    {
      q: 'Why do containers start much faster than VMs?',
      options: ['They read from faster disks', 'They skip booting a whole OS', 'They are compiled to machine code', 'They run with no filesystem'],
      answer: 1,
      why: 'A VM boots a whole guest OS; a container is an isolated process started on the already-running host kernel. Containers still have a filesystem: it comes from their image.',
    },
    {
      q: 'Which Linux feature stops one container from using all of the host’s memory?',
      options: ['Namespaces', 'cgroups', 'chroot', 'The hypervisor'],
      answer: 1,
      why: 'cgroups enforce resource limits: exceed the memory limit and the kernel OOM-kills the process. Namespaces only change what a container can see, not how much it can use.',
    },
    {
      q: 'Your Dockerfile runs COPY . . before RUN npm ci. What happens when you edit one source file?',
      options: [
        'Only the COPY . . layer rebuilds, nothing else',
        'npm ci runs again: a layer below changed',
        'Nothing rebuilds: the file is tiny',
        'The base image is downloaded again',
      ],
      answer: 1,
      why: 'Changing the COPY . . layer invalidates the cache for every layer above it, including the slow install. Layers below it, like the base image, stay cached.',
    },
    {
      q: 'Seen from the host, what is a running container?',
      options: ['A small VM with its own kernel', 'An ordinary process, isolated', 'A file the kernel reads at boot', 'A separate machine on the network'],
      answer: 1,
      why: "It's a normal process with an ordinary host PID, isolated by namespaces and limited by cgroups. It shares the host's kernel, which is why it starts fast and why its isolation is lighter than a VM's.",
    },
  ],
};

export default lesson;
