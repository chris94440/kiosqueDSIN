package fr.dsin.kiosque;

import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@ApplicationScoped
public class VoteStore {
    private final Map<String, Integer> counters = new LinkedHashMap<>();
    private Instant updatedAt = Instant.now();

    public synchronized VoteBoard snapshot() {
        return toBoard();
    }

    public synchronized VoteBoard vote(String breedId) {
        counters.merge(breedId, 1, Integer::sum);
        updatedAt = Instant.now();
        return toBoard();
    }

    public synchronized VoteBoard reset() {
        counters.clear();
        updatedAt = Instant.now();
        return toBoard();
    }

    private VoteBoard toBoard() {
        long totalVotes = 0;
        List<VoteCount> votes = new ArrayList<>();
        for (var entry : counters.entrySet()) {
            int count = entry.getValue();
            totalVotes += count;
            votes.add(new VoteCount(entry.getKey(), count));
        }
        votes.sort(Comparator.comparingInt(VoteCount::count).reversed().thenComparing(VoteCount::breedId));
        return new VoteBoard(totalVotes, updatedAt.toString(), List.copyOf(votes));
    }

    public record VoteBoard(long totalVotes, String updatedAt, List<VoteCount> votes) {}
    public record VoteCount(String breedId, int count) {}
}
