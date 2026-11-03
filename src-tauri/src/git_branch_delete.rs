use std::path::Path;

use crate::fs::{expand_home, git_branch_name, git_checked, git_head_branch, git_is_work_tree};

const BRANCH_NOT_MERGED: &str = "BRANCH_NOT_MERGED";

/// Delete a local branch. A safe delete that git refuses as unmerged returns `BRANCH_NOT_MERGED` so the UI can ask before force-deleting.
#[tauri::command]
pub async fn git_delete_branch(cwd: String, name: String, force: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_delete_branch_for(&expand_home(&cwd), &name, force)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn git_delete_branch_for(root: &Path, name: &str, force: bool) -> Result<(), String> {
    if !git_is_work_tree(root) {
        return Err("Not a git repository".into());
    }
    let name = git_branch_name(root, name)?;
    if git_head_branch(root).as_deref() == Some(name.as_str()) {
        return Err("Can't delete the branch you're on".into());
    }
    let flag = if force { "-D" } else { "-d" };
    match git_checked(root, &["branch", flag, &name]) {
        Err(err) if !force && err.contains("not fully merged") => Err(BRANCH_NOT_MERGED.into()),
        result => result,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct Repo(PathBuf);
    impl Drop for Repo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn repo() -> Repo {
        let root =
            std::env::temp_dir().join(format!("bonocode-branch-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        git_checked(&root, &["init", "-b", "main"]).unwrap();
        commit(&root, "initial");
        Repo(root)
    }

    fn commit(root: &Path, message: &str) {
        git_checked(
            root,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "commit",
                "--allow-empty",
                "-m",
                message,
            ],
        )
        .unwrap();
    }

    fn unmerged_branch() -> Repo {
        let repo = repo();
        git_checked(&repo.0, &["checkout", "-b", "feature"]).unwrap();
        commit(&repo.0, "feature work");
        git_checked(&repo.0, &["checkout", "main"]).unwrap();
        repo
    }

    fn branch_exists(root: &Path, name: &str) -> bool {
        let spec = format!("refs/heads/{name}");
        git_checked(root, &["show-ref", "--verify", "--quiet", &spec]).is_ok()
    }

    #[test]
    fn deletes_a_merged_branch() {
        let repo = repo();
        git_checked(&repo.0, &["branch", "feature"]).unwrap();

        git_delete_branch_for(&repo.0, "feature", false).unwrap();

        assert!(!branch_exists(&repo.0, "feature"));
    }

    #[test]
    fn returns_branch_not_merged_for_an_unmerged_branch() {
        let repo = unmerged_branch();

        let err = git_delete_branch_for(&repo.0, "feature", false).unwrap_err();

        assert_eq!(err, BRANCH_NOT_MERGED);
        assert!(branch_exists(&repo.0, "feature"));
    }

    #[test]
    fn force_deletes_an_unmerged_branch() {
        let repo = unmerged_branch();

        git_delete_branch_for(&repo.0, "feature", true).unwrap();

        assert!(!branch_exists(&repo.0, "feature"));
    }

    #[test]
    fn refuses_to_delete_the_checked_out_branch() {
        let repo = repo();

        let err = git_delete_branch_for(&repo.0, "main", true).unwrap_err();

        assert_eq!(err, "Can't delete the branch you're on");
        assert!(branch_exists(&repo.0, "main"));
    }

    #[test]
    fn rejects_an_invalid_branch_name() {
        let repo = repo();

        assert!(git_delete_branch_for(&repo.0, "bad name", false).is_err());
    }
}
