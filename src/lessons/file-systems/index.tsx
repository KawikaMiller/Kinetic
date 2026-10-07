import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A file is an inode (its metadata and block pointers) plus one or more names in directories; a journal makes multi-block updates all-or-nothing, and only fsync makes your write durable.',
    what: 'A file system splits the disk into blocks: a superblock describing the layout, a bitmap of which blocks are used, a table of inodes, and data blocks. An inode holds a file\'s size, permissions, link count, timestamps and pointers to its data blocks, but not its name. A directory is a file whose data is a list of name → inode number entries, so opening a path walks inode, directory block, inode, and so on. A hard link is a second name for the same inode; a symlink is a separate inode holding a path. Even a tiny append changes several blocks, and a crash can leave some written and others not; a journal writes them to a log first and makes them count only once a commit record lands.',
    analogy: 'A library. The inode is the catalogue card (where the book sits, how long it is); directories are the shelf labels pointing at cards; a hard link is a second label on the same card, a symlink is a sticky note saying "see shelf B". The journal is the librarian writing "moving book X to shelf Y" in a notebook before moving anything, so a fire alarm mid-move never leaves the catalogue wrong.',
    useCases: [
      '"No space left on device" while du says the disk is half empty: a deleted file still held open',
      'Writing a config or database file safely: write a temp file, fsync it, rename, fsync the directory',
      'Choosing ext4 mount options (data=ordered vs writeback) and knowing what fsck can and can\'t fix',
      'Hard links in backups and package stores, symlinks for "current" release directories',
    ],
    why: 'Every service writes files, and the bugs here are silent: data that "was written" vanishes after a power cut, or a full disk nobody can find. Knowing inodes and links explains `rm`, `df` vs `du` and the open descriptors from `file-descriptors`; knowing journaling and fsync tells you what is really durable, which `transactions-acid` relies on. It builds on `storage-devices` (why the journal writes sequentially) and `command-line`.',
    watch: 'Path walk: the disk is a grid of blocks: the superblock (SB) and bitmap (BM) are dark grey, the inode table (IT) violet, data blocks in use blue, free blocks a grey outline, and the block being read now turns solid in its own colour with a yellow ring. In the directory tree each box is an entry "name #inode": the one being read is solid yellow and inodes already read on the path are violet. The inode table lists the fields of the last inode read; the directory panel rings the entry being looked up in yellow, and a missing name in red. Links: an inode with two or more names is violet, a dangling symlink has a red dashed box and edge, a file with no names left but still open has a dashed grey card, and the df readout turns red while it disagrees with du; shell lines are green, errors red. Crash: the writes are chips (blue data block, violet inode, grey bitmap, sky-blue journal entries, a green commit record; sky-blue chips under the disk rows are the journal\'s contents), faded and dashed if the power cut came first, with the last write before the cut ringed yellow. Disk rows are outlined green once they hold the new state. The verdict is green when the append survived, orange when it was lost cleanly, and red for each inconsistency. fsync: green rows and events reached the disk before the cut, orange ones were only in memory and are lost, dark grey events come after the cut, and the yellow line is the power cut.',
  },
  tryThis: [
    'In Path walk, step through cat /docs/notes.txt and count the block reads; then pick cat /docs/draft.txt and see where it fails.',
    'In Links, press ln notes.txt n2, ln -s notes.txt s2, rm notes.txt, then cat n2 and cat s2.',
    'In Links, press Reset, then exec 3< notes.txt and rm notes.txt: df and du disagree until you press exec 3<&-.',
    'In Crash with no journal, slide Power cut across every write for each write order; then switch to data=journal and do the same.',
    'In fsync, set The file to Just created and turn on fsync(fd) only, with the cut at 12 ms: the file vanishes. Turn on fsync(dir fd).',
  ],
  keyIdeas: [
    'An inode is the file; names live in directories, and the link count says how many there are.',
    'Data is freed only when no name and no open descriptor refers to it.',
    'A journal makes several block writes one all-or-nothing transaction, via its commit record.',
    'write() only reaches the page cache: fsync the file (and its directory, for a new file) before calling it durable.',
  ],
  quiz: [
    {
      q: 'You rm a log file that a running process still has open. What happens to its data?',
      options: [
        'It stays on disk until the process closes it',
        'It is overwritten with zeros straight away',
        'The process gets an error on its next write',
        'It moves into a hidden trash folder for later',
      ],
      answer: 0,
      why: 'rm only removes a directory entry. The inode and its blocks are freed when the link count and the open descriptors both reach 0, which is why df can report a full disk that du can\'t account for. Nothing is zeroed, and the process keeps writing happily.',
    },
    {
      q: 'write() returned success, and the power failed a second later. Is the data on disk?',
      options: [
        'Not unless fsync finished before the cut',
        'Yes: write() returns once the disk has it',
        'Yes: the journal logs every single write()',
        'No: write() data never reaches the disk',
      ],
      answer: 0,
      why: 'write() copies into the page cache and returns; the kernel flushes later (ext4 commits every 5 s by default). Only a completed fsync promises it is on disk. It isn\'t lost forever either: left alone, the background flush would have written it.',
    },
    {
      q: 'Where is a file\'s name stored?',
      options: ['In its directory\'s list of entries', 'In the inode, next to its size', 'In the superblock\'s name table', 'In the file\'s first data block'],
      answer: 0,
      why: 'A directory\'s data is a list of name → inode pairs. The inode has no name field, which is what lets one inode have several names (hard links).',
    },
    {
      q: 'You make hard link n2 and symlink s2 to notes.txt, then rm notes.txt. Which still opens the file?',
      options: ['Only n2, the hard link', 'Only s2, the symlink', 'Both still open the file', 'Neither: the data is gone'],
      answer: 0,
      why: 'n2 names the same inode, whose link count just went from 2 to 1, so the data stays. s2 holds the path notes.txt, which no longer exists, so it dangles.',
    },
    {
      q: 'In ext4\'s default data=ordered mode, which of these can\'t happen after a crash?',
      options: [
        'An inode pointing at data never written',
        'Losing the last few seconds of writes',
        'Replaying the journal at the next mount',
        'Throwing away an uncommitted transaction',
      ],
      answer: 0,
      why: 'Ordered mode writes the data blocks before the metadata transaction commits, so committed metadata never points at unwritten data. Recent writes can still be lost, and replaying or discarding transactions is exactly how recovery works.',
    },
  ],
};

export default lesson;
