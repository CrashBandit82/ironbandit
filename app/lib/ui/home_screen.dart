import 'package:flutter/material.dart';

import '../data/session.dart';
import 'more_tab.dart';
import 'rest_bar.dart';
import 'training_tab.dart';
import 'weight_tab.dart';
import 'widgets.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  var _tab = 0;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final revision = SessionScope.of(context).dataRevision;
    return Scaffold(
      // new keys after a restore or delete: no tab keeps the old data
      body: IndexedStack(
        index: _tab,
        children: [
          TrainingTab(key: ValueKey('t$revision')),
          WeightTab(key: ValueKey('w$revision')),
          const MoreTab(),
        ],
      ),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const RestBar(),
          NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              NavigationDestination(
                icon: const Icon(Icons.fitness_center_outlined),
                selectedIcon: const Icon(Icons.fitness_center),
                label: t.tabTraining,
              ),
              NavigationDestination(
                icon: const Icon(Icons.monitor_weight_outlined),
                selectedIcon: const Icon(Icons.monitor_weight),
                label: t.tabWeight,
              ),
              NavigationDestination(
                icon: const Icon(Icons.tune_outlined),
                selectedIcon: const Icon(Icons.tune),
                label: t.tabMore,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
