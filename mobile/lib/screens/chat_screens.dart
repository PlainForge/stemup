// Role messaging (src/lib/messages.ts, components/ChatPanel.tsx): a role's group
// chat and each task's thread between the person doing it and whoever gave it.
// Both open full screen above the tab bar (/chat/:roleId and /thread/:taskId),
// which is also where their push notifications land. Your own messages sit on the
// right in blue; long-press a message to copy or delete it.
import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';
import '../widgets/page_scaffold.dart';
import '../widgets/role_icons.dart';

/// A role's group chat, for everyone in it (once its owner or an admin turns it on).
class RoleChatScreen extends StatefulWidget {
  const RoleChatScreen({super.key, required this.roleId});

  final String roleId;

  @override
  State<RoleChatScreen> createState() => _RoleChatScreenState();
}

class _RoleChatScreenState extends State<RoleChatScreen> {
  late final StreamSubscription<Role?> _sub;
  Role? _role;
  bool _loaded = false;
  late final _messages = Db.roleChat(widget.roleId);

  @override
  void initState() {
    super.initState();
    _sub = Db.roleStream(widget.roleId).listen(
      (r) => setState(() {
        _role = r;
        _loaded = true;
      }),
    );
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final role = _role;
    final uid = app.user?.uid;
    final back = '/roles/${widget.roleId}';
    if (!_loaded) return const LoadingView();
    if (role == null) return _ChatFrame(backPath: '/roles', title: 'Group Chat', notice: 'This role no longer exists.');
    if (!app.isAdmin && !role.members.contains(uid)) {
      return _ChatFrame(backPath: '/roles', title: role.name, notice: "You're not in this role.");
    }
    // Admins can be in any role's chat, so they aren't counted as its people
    final people = role.members.where((m) => !app.admins.contains(m)).length;
    return _ChatFrame(
      backPath: back,
      title: role.name,
      subtitle: 'Group chat · $people ${people == 1 ? 'person' : 'people'}',
      leading: RoleIconBadge.of(role, size: 40, solid: true),
      child: ChatView(
        collection: _messages,
        canPost: role.chatEnabled,
        closedText: 'The group chat is turned off.',
        canModerate: app.canManage(role),
        placeholder: 'Message ${role.name}',
        emptyText: 'No messages yet. Everyone in ${role.name} can read and write here.',
        onMessages: (m) {
          if (m.isNotEmpty) app.markChatSeen(widget.roleId, m.last.at);
        },
      ),
    );
  }
}

/// A task's thread: only the person doing it and whoever gave it.
class TaskThreadScreen extends StatefulWidget {
  const TaskThreadScreen({super.key, required this.taskId});

  final String taskId;

  @override
  State<TaskThreadScreen> createState() => _TaskThreadScreenState();
}

class _TaskThreadScreenState extends State<TaskThreadScreen> {
  late final StreamSubscription<Task?> _sub;
  Task? _task;
  bool _loaded = false;
  String? _giverName;
  late final _messages = Db.taskThread(widget.taskId);

  @override
  void initState() {
    super.initState();
    _sub = Db.taskStream(widget.taskId).listen((t) {
      if (!mounted) return;
      final first = _task == null && t != null;
      setState(() {
        _task = t;
        _loaded = true;
      });
      if (t != null) {
        // Reading the thread marks it seen (after this frame, since it notifies listeners)
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) context.read<AppState>().markThreadSeen(t);
        });
        if (first && t.assignedBy.isNotEmpty) {
          Db.getUsers([t.assignedBy])
              .then((u) {
                if (mounted && u.isNotEmpty) setState(() => _giverName = u.first.name);
              })
              .catchError((_) {});
        }
      }
    }, onError: (_) => setState(() => _loaded = true));
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final t = _task;
    if (!_loaded) return const LoadingView();
    if (t == null) return _ChatFrame(backPath: '/tasks', title: 'Questions', notice: 'This task no longer exists.');
    final isDoer = t.assignedTo == app.user?.uid;
    final back = isDoer ? '/tasks' : '/roles/${t.roleId}';
    if (!app.inTaskThread(t)) {
      return _ChatFrame(
        backPath: back,
        title: t.title,
        notice: 'Only the person doing this task and whoever gave it can see its questions.',
      );
    }
    final role = app.roleById(t.roleId);
    final other = isDoer ? (t.assignedBy.isEmpty ? "the role's instructors" : _giverName ?? 'whoever gave it') : t.assignedName;
    return _ChatFrame(
      backPath: back,
      title: t.title,
      subtitle: 'Only you and $other can see this${role == null ? '' : ' · ${role.name}'}',
      leading: _IconTile(icon: FontAwesomeIcons.comments.data),
      child: ChatView(
        collection: _messages,
        canPost: role?.taskThreadsEnabled ?? false,
        closedText: 'Task questions are turned off in this role.',
        placeholder: isDoer ? 'Ask a question' : 'Reply',
        emptyText: isDoer
            ? 'Ask about this task here, or raise any concerns.'
            : 'No messages yet. ${t.assignedName} can ask questions about this task here.',
      ),
    );
  }
}

class _IconTile extends StatelessWidget {
  const _IconTile({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
    width: 40,
    height: 40,
    decoration: BoxDecoration(color: Palette.resolve(context, Palette.blue50), borderRadius: BorderRadius.circular(12)),
    child: Icon(icon, size: 16, color: Palette.resolve(context, Palette.navActive)),
  );
}

/// The full-screen frame: a back button and title, then the messages.
class _ChatFrame extends StatelessWidget {
  const _ChatFrame({required this.backPath, required this.title, this.subtitle, this.leading, this.child, this.notice});

  final String backPath;
  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? child;

  /// Shown instead of [child] (the role or task is gone, or it isn't theirs).
  final String? notice;

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    return CupertinoPageScaffold(
      // The page shrinks to sit on the keyboard, and only the strip behind the keyboard shows
      // this color. iOS 26's keyboard has rounded corners, so match the message bar there: the
      // bar then runs into the keyboard with no gap in another color at its corners.
      backgroundColor: Palette.card(context),
      child: ColoredBox(
        color: Palette.background(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: EdgeInsets.fromLTRB(16, pad.top + 8, 16, 12),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: Palette.separator(context))),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  BackPill(label: 'Back', onPressed: () => context.canPop() ? context.pop() : context.go(backPath)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (leading != null) ...[leading!, const SizedBox(width: 12)],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [Heading(title, size: 18, maxLines: 2), if (subtitle != null) Muted(subtitle!, size: 13, maxLines: 2)],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child:
                  child ??
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(child: Muted(notice ?? '', center: true)),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The message list and box (ChatPanel.tsx).
class ChatView extends StatefulWidget {
  const ChatView({
    super.key,
    required this.collection,
    required this.canPost,
    required this.emptyText,
    this.closedText,
    this.canModerate = false,
    this.placeholder = 'Message',
    this.onMessages,
  });

  final CollectionReference<Map<String, dynamic>> collection;
  final bool canPost;
  final String emptyText;

  /// Shown instead of the message box when [canPost] is false.
  final String? closedText;

  /// Can delete anyone's message (the role's instructors and admins, in a group chat).
  final bool canModerate;
  final String placeholder;

  /// Every time the messages change (after the frame), e.g. to mark them seen.
  final ValueChanged<List<ChatMessage>>? onMessages;

  @override
  State<ChatView> createState() => _ChatViewState();
}

/// Messages from the same person this close together share one header.
const _groupGap = Duration(minutes: 5);

/// A message shown the moment it's sent, before the server has it. [id] is the
/// real message's id once the server answers; it stops showing when that arrives.
class _Pending {
  _Pending(this.key, this.text);

  final String key;
  final String text;
  String? id;
}

const _pendingPrefix = 'pending-';

class _ChatViewState extends State<ChatView> {
  late final StreamSubscription<List<ChatMessage>> _sub;
  List<ChatMessage>? _messages;
  bool _error = false;
  final _draft = TextEditingController();
  final List<_Pending> _pending = [];
  int _pendingCount = 0;

  /// Sent too many messages too fast: no sending until then, with a countdown.
  DateTime? _timeoutUntil;
  Timer? _tick;

  bool get _timedOut => _timeoutUntil != null && _timeoutUntil!.isAfter(DateTime.now());

  void _startTimeout(DateTime until) {
    _tick?.cancel();
    setState(() => _timeoutUntil = until);
    _tick = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      if (!_timedOut) t.cancel();
      setState(() {});
    });
  }

  @override
  void initState() {
    super.initState();
    _sub = Db.messagesStream(widget.collection).listen(
      (m) {
        if (!mounted) return;
        setState(() {
          _messages = m;
          // Sent messages the server has now delivered
          final ids = {for (final x in m) x.id};
          _pending.removeWhere((p) => p.id != null && ids.contains(p.id));
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) widget.onMessages?.call(m);
        });
      },
      onError: (_) {
        if (mounted) {
          setState(() {
            _messages = const [];
            _error = true;
          });
        }
      },
    );
    _draft.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _sub.cancel();
    _tick?.cancel();
    _draft.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _draft.text.trim();
    if (text.isEmpty || _timedOut) return;
    // Show it straight away; the server's copy replaces it when it arrives
    final p = _Pending('${_pendingCount++}', text);
    setState(() => _pending.add(p));
    _draft.clear();
    HapticFeedback.lightImpact();
    try {
      final id = await Db.sendMessage(widget.collection, text);
      if (!mounted) return;
      setState(() {
        final delivered = _messages?.any((m) => m.id == id) ?? false;
        if (id == null || delivered) {
          _pending.remove(p);
        } else {
          p.id = id;
        }
      });
    } catch (e) {
      if (!mounted) return;
      // Not sent: take it back out, and put it back in the box if that's empty
      setState(() => _pending.remove(p));
      if (_draft.text.trim().isEmpty) _draft.text = text;
      if (e is ChatTimeout) {
        HapticFeedback.heavyImpact();
        _startTimeout(e.until);
      } else {
        showToast(context, "Couldn't send your message. Please try again.", error: true);
      }
    }
  }

  Future<void> _options(ChatMessage m, bool canDelete) async {
    HapticFeedback.selectionClick();
    final action = await showCupertinoModalPopup<String>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        actions: [
          CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx, 'copy'), child: const Text('Copy')),
          if (canDelete)
            CupertinoActionSheetAction(
              isDestructiveAction: true,
              onPressed: () => Navigator.pop(ctx, 'delete'),
              child: const Text('Delete'),
            ),
        ],
        cancelButton: CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
      ),
    );
    if (!mounted) return;
    if (action == 'copy') {
      await Clipboard.setData(ClipboardData(text: m.text));
      if (mounted) showToast(context, 'Copied');
    } else if (action == 'delete') {
      final ok = await confirmDialog(
        context,
        title: 'Delete Message',
        message: 'Delete this message for everyone?',
        confirmLabel: 'Delete',
        destructive: true,
      );
      if (ok) await Db.deleteMessage(widget.collection, m.id).catchError((_) {});
    }
  }

  static String _day(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(d.year, d.month, d.day);
    if (day == today) return 'Today';
    if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
    return DateFormat(d.year == now.year ? 'EEE, MMM d' : 'EEE, MMM d, y', 'en_US').format(d);
  }

  static bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  Widget _bubble(BuildContext context, List<ChatMessage> list, int i, String me) {
    final m = list[i];
    final prev = i > 0 ? list[i - 1] : null;
    final newDay = prev == null || !_sameDay(prev.at, m.at);
    final grouped = !newDay && prev.uid == m.uid && m.at.difference(prev.at) < _groupGap;
    final mine = m.uid == me;
    final sending = m.id.startsWith(_pendingPrefix);
    final width = MediaQuery.sizeOf(context).width;
    final time = sending ? 'Sending...' : DateFormat('h:mm a', 'en_US').format(m.at);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (newDay)
          Padding(
            padding: const EdgeInsets.only(top: 16, bottom: 4),
            child: Center(
              child: Text(
                _day(m.at).toUpperCase(),
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: .8, color: Palette.tertiary(context)),
              ),
            ),
          ),
        Padding(
          padding: EdgeInsets.only(top: grouped ? 3 : 12),
          child: Row(
            mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (!mine) ...[
                SizedBox(width: 28, child: grouped ? null : Avatar(m.photoURL, size: 28, name: m.name)),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Column(
                  crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    if (!grouped)
                      Padding(
                        padding: const EdgeInsets.only(left: 4, right: 4, bottom: 3),
                        child: Text.rich(
                          TextSpan(
                            children: [
                              if (!mine)
                                TextSpan(
                                  text: '${m.name} · ',
                                  style: TextStyle(fontWeight: FontWeight.w600, color: Palette.secondary(context)),
                                ),
                              TextSpan(text: time),
                            ],
                          ),
                          style: TextStyle(fontSize: 12, color: Palette.tertiary(context)),
                        ),
                      ),
                    GestureDetector(
                      onLongPress: sending ? null : () => _options(m, mine || widget.canModerate),
                      child: AnimatedOpacity(
                        opacity: sending ? .6 : 1,
                        duration: const Duration(milliseconds: 150),
                        child: Container(
                          constraints: BoxConstraints(maxWidth: width * .74),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                          decoration: BoxDecoration(
                            color: mine ? Palette.blue600 : Palette.resolve(context, Palette.gray100),
                            borderRadius: BorderRadius.only(
                              topLeft: const Radius.circular(18),
                              topRight: const Radius.circular(18),
                              bottomLeft: Radius.circular(mine ? 18 : 6),
                              bottomRight: Radius.circular(mine ? 6 : 18),
                            ),
                          ),
                          child: Text(
                            m.text,
                            style: TextStyle(fontSize: 16, height: 1.3, color: mine ? const Color(0xFFFFFFFF) : Palette.label(context)),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final me = app.user?.uid ?? '';
    final messages = _messages;
    // The server's messages, then this person's still on their way
    final list = messages == null
        ? null
        : [
            ...messages,
            for (final p in _pending)
              if (p.id == null || !messages.any((m) => m.id == p.id))
                ChatMessage(id: '$_pendingPrefix${p.key}', uid: me, name: app.userData?.name ?? '', text: p.text),
          ];
    final pad = MediaQuery.paddingOf(context);
    final timedOut = _timedOut;
    final canSend = _draft.text.trim().isNotEmpty && !timedOut;
    // Rebuilt whenever the page resizes for the keyboard. The keyboard is read from the raw
    // view: the page scaffold has already taken it out of MediaQuery
    return LayoutBuilder(
      builder: (context, _) {
        final keyboardOpen = View.of(context).viewInsets.bottom > 0;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: list == null
                  ? const Center(child: RingSpinner())
                  : list.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(32),
                      child: Center(child: Muted(_error ? "Couldn't load messages." : widget.emptyText, center: true)),
                    )
                  // Newest at the bottom, and the list starts there
                  : ListView.builder(
                      reverse: true,
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                      itemCount: list.length,
                      itemBuilder: (context, i) => _bubble(context, list, list.length - 1 - i, me),
                    ),
            ),
            if (widget.canPost && timedOut)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: Palette.resolve(
                  context,
                  const CupertinoDynamicColor.withBrightness(color: Palette.amber50, darkColor: Color(0xFF3A2A0A)),
                ),
                child: Row(
                  children: [
                    Icon(
                      CupertinoIcons.hourglass,
                      size: 16,
                      color: Palette.resolve(
                        context,
                        const CupertinoDynamicColor.withBrightness(color: Palette.amber700, darkColor: Color(0xFFFCD34D)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Slow down! You sent too many messages at once. You can send again in '
                        '${(_timeoutUntil!.difference(DateTime.now()).inMilliseconds / 1000).ceil().clamp(1, 30)}s.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Palette.resolve(
                            context,
                            const CupertinoDynamicColor.withBrightness(color: Palette.amber700, darkColor: Color(0xFFFCD34D)),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (widget.canPost)
              Container(
                // Snug on the keyboard while typing; above the home indicator otherwise
                padding: EdgeInsets.fromLTRB(12, 8, 12, keyboardOpen ? 4 : 8 + pad.bottom),
                decoration: BoxDecoration(
                  color: Palette.card(context),
                  border: Border(top: BorderSide(color: Palette.separator(context))),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: CupertinoTextField(
                        controller: _draft,
                        placeholder: widget.placeholder,
                        minLines: 1,
                        maxLines: 5,
                        maxLength: maxMessageLength,
                        textCapitalization: TextCapitalization.sentences,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        style: TextStyle(fontSize: 16, color: Palette.label(context)),
                        placeholderStyle: TextStyle(fontSize: 16, color: Palette.tertiary(context)),
                        decoration: BoxDecoration(
                          color: Palette.fill(context),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Palette.separator(context)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Semantics(
                      label: 'Send',
                      button: true,
                      child: CupertinoButton(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(40, 40),
                        onPressed: canSend ? _send : null,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: canSend ? Palette.blue600 : Palette.resolve(context, Palette.gray300),
                          ),
                          child: const Icon(CupertinoIcons.arrow_up, size: 20, color: Color(0xFFFFFFFF)),
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else if (widget.closedText != null)
              Container(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + pad.bottom),
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: Palette.separator(context))),
                ),
                child: Muted(widget.closedText!, center: true, size: 14),
              ),
          ],
        );
      },
    );
  }
}
